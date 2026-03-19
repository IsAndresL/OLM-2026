const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();
const googleClient = new Client({});
const GUIAS_RUTA_ESTADOS = ['asignado', 'en_ruta', 'no_contesto', 'reagendar'];

function parseFecha(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function hasGoogleKey() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

function toOrderRows(guias) {
  return guias.map((g, idx) => ({
    posicion: idx + 1,
    guia_id: g.id,
    numero_guia: g.numero_guia,
    nombre_destinatario: g.nombre_destinatario,
    direccion_destinatario: g.direccion_destinatario,
    lat: g.lat ?? null,
    lng: g.lng ?? null,
  }));
}

async function geocodeDireccion(direccionCompleta) {
  const response = await googleClient.geocode({
    params: {
      address: direccionCompleta,
      key: process.env.GOOGLE_MAPS_API_KEY,
      language: 'es',
      region: 'co',
    },
  });

  const first = response?.data?.results?.[0]?.geometry?.location;
  if (!first) return null;
  return { lat: first.lat, lng: first.lng };
}

async function completarCoordenadas(guias) {
  if (!hasGoogleKey()) return guias;

  const cloned = [...guias];
  for (let i = 0; i < cloned.length; i += 1) {
    const guia = cloned[i];
    if (Number.isFinite(asNumber(guia.lat)) && Number.isFinite(asNumber(guia.lng))) continue;

    const direccion = `${guia.direccion_destinatario || ''}, ${guia.barrio || ''}, ${guia.ciudad_destino || 'Santa Marta'}, Colombia`;
    try {
      const geo = await geocodeDireccion(direccion);
      if (geo) {
        guia.lat = geo.lat;
        guia.lng = geo.lng;
        await supabase
          .from('guias')
          .update({ lat: geo.lat, lng: geo.lng })
          .eq('id', guia.id);
      }
    } catch (_err) {
      // Si falla geocoding no bloquea, se mantiene fallback.
    }
  }

  return cloned;
}

function ordenarHeuristica(guias) {
  return [...guias].sort((a, b) => {
    const zonaA = (a.zonas?.nombre || '').toLowerCase();
    const zonaB = (b.zonas?.nombre || '').toLowerCase();
    if (zonaA !== zonaB) return zonaA.localeCompare(zonaB, 'es');

    const barrioA = (a.barrio || '').toLowerCase();
    const barrioB = (b.barrio || '').toLowerCase();
    if (barrioA !== barrioB) return barrioA.localeCompare(barrioB, 'es');

    return String(a.numero_guia || '').localeCompare(String(b.numero_guia || ''), 'es');
  });
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * (Math.PI / 180);
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimarDesdeCoords(origen, orden) {
  if (!origen || !Number.isFinite(asNumber(origen.lat)) || !Number.isFinite(asNumber(origen.lng))) {
    return { ordenConMetricas: toOrderRows(orden), distanciaTotalKm: null, tiempoTotalMin: null };
  }

  let prev = { lat: Number(origen.lat), lng: Number(origen.lng) };
  let distanciaTotal = 0;
  let tiempoTotal = 0;

  const ordenConMetricas = orden.map((g, idx) => {
    const lat = asNumber(g.lat);
    const lng = asNumber(g.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        posicion: idx + 1,
        guia_id: g.id,
        numero_guia: g.numero_guia,
        nombre_destinatario: g.nombre_destinatario,
        direccion_destinatario: g.direccion_destinatario,
        lat: g.lat ?? null,
        lng: g.lng ?? null,
        distancia_desde_anterior_km: null,
        tiempo_desde_anterior_min: null,
      };
    }

    const km = distanceKm(prev.lat, prev.lng, lat, lng);
    const min = Math.round((km / 25) * 60); // velocidad urbana promedio
    distanciaTotal += km;
    tiempoTotal += min;
    prev = { lat, lng };

    return {
      posicion: idx + 1,
      guia_id: g.id,
      numero_guia: g.numero_guia,
      nombre_destinatario: g.nombre_destinatario,
      direccion_destinatario: g.direccion_destinatario,
      lat,
      lng,
      distancia_desde_anterior_km: Number(km.toFixed(2)),
      tiempo_desde_anterior_min: min,
    };
  });

  return {
    ordenConMetricas,
    distanciaTotalKm: Number(distanciaTotal.toFixed(2)),
    tiempoTotalMin: tiempoTotal,
  };
}

async function optimizarConGoogle(origen, guias) {
  if (!hasGoogleKey()) return null;

  const coordenables = guias.filter((g) => Number.isFinite(asNumber(g.lat)) && Number.isFinite(asNumber(g.lng)));
  if (coordenables.length !== guias.length || coordenables.length < 2) return null;

  const points = coordenables.map((g) => `${g.lat},${g.lng}`);
  const origin = `${origen.lat},${origen.lng}`;

  const response = await googleClient.distancematrix({
    params: {
      key: process.env.GOOGLE_MAPS_API_KEY,
      origins: [origin, ...points],
      destinations: points,
      mode: 'driving',
      language: 'es',
      region: 'co',
    },
  });

  const rows = response?.data?.rows || [];
  if (!rows.length) return null;

  const pending = new Set(coordenables.map((_, idx) => idx));
  let currentRow = 0; // fila 0 = origen
  const orderIndexes = [];
  let totalDistM = 0;
  let totalSec = 0;

  while (pending.size > 0) {
    let bestIdx = null;
    let bestCost = Infinity;

    for (const idx of pending) {
      const element = rows[currentRow]?.elements?.[idx];
      const sec = element?.duration?.value;
      if (typeof sec !== 'number') continue;
      if (sec < bestCost) {
        bestCost = sec;
        bestIdx = idx;
      }
    }

    if (bestIdx == null) break;

    const selected = rows[currentRow]?.elements?.[bestIdx];
    totalDistM += selected?.distance?.value || 0;
    totalSec += selected?.duration?.value || 0;

    orderIndexes.push(bestIdx);
    pending.delete(bestIdx);
    currentRow = bestIdx + 1; // en matriz, fila idx+1 representa ese punto como origen
  }

  if (orderIndexes.length !== coordenables.length) return null;

  const ordered = orderIndexes.map((i) => coordenables[i]);
  return {
    orden: ordered,
    distanciaTotalKm: Number((totalDistM / 1000).toFixed(2)),
    tiempoTotalMin: Math.round(totalSec / 60),
  };
}

router.post('/optimizar', verificarToken, checkRole(['admin']), checkAdminPermission('rutas.manage'), async (req, res) => {
  try {
    const repartidorId = req.body?.repartidor_id;
    const fecha = parseFecha(req.body?.fecha);
    const origen = req.body?.origen || null;

    if (!repartidorId) {
      return res.status(400).json({ error: 'repartidor_id es requerido' });
    }

    const { data: repartidor, error: repError } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('id', repartidorId)
      .single();

    if (repError || !repartidor) return res.status(404).json({ error: 'Repartidor no encontrado' });
    if (repartidor.rol !== 'repartidor') return res.status(400).json({ error: 'El usuario no es repartidor' });

    const { data: guias, error: guiasError } = await supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, direccion_destinatario, barrio, ciudad_destino, lat, lng, zona_id, zonas(nombre)')
      .eq('repartidor_id', repartidorId)
      .in('estado_actual', GUIAS_RUTA_ESTADOS)
      .gte('created_at', `${fecha}T00:00:00`)
      .lte('created_at', `${fecha}T23:59:59`)
      .order('created_at', { ascending: true });

    if (guiasError) return res.status(500).json({ error: guiasError.message });
    if (!guias || guias.length === 0) {
      return res.status(404).json({ error: 'No hay guias activas para optimizar en esa fecha' });
    }

    const guiasConCoords = await completarCoordenadas(guias);

    let fuente = 'heuristica';
    let orden = ordenarHeuristica(guiasConCoords);
    let distanciaTotalKm = null;
    let tiempoTotalMin = null;

    if (origen && Number.isFinite(asNumber(origen.lat)) && Number.isFinite(asNumber(origen.lng))) {
      try {
        const optGoogle = await optimizarConGoogle(origen, guiasConCoords);
        if (optGoogle) {
          fuente = 'google_maps';
          orden = optGoogle.orden;
          distanciaTotalKm = optGoogle.distanciaTotalKm;
          tiempoTotalMin = optGoogle.tiempoTotalMin;
        }
      } catch (_err) {
        // Si Google falla, continua heuristica.
      }
    }

    const estimado = estimarDesdeCoords(origen, orden);
    const ordenConMetricas = estimado.ordenConMetricas;
    if (distanciaTotalKm == null) distanciaTotalKm = estimado.distanciaTotalKm;
    if (tiempoTotalMin == null) tiempoTotalMin = estimado.tiempoTotalMin;

    const ordenGuias = ordenConMetricas.map((row) => row.guia_id);

    const { data: ruta, error: upsertError } = await supabase
      .from('rutas_dia')
      .upsert({
        repartidor_id: repartidorId,
        fecha,
        orden_guias: ordenGuias,
        distancia_km: distanciaTotalKm,
        tiempo_min: tiempoTotalMin,
        estado: 'pendiente',
      }, { onConflict: 'repartidor_id,fecha' })
      .select('id, distancia_km, tiempo_min')
      .single();

    if (upsertError) return res.status(500).json({ error: upsertError.message });

    return res.json({
      ruta_id: ruta.id,
      orden: ordenConMetricas,
      distancia_total_km: ruta.distancia_km,
      tiempo_total_min: ruta.tiempo_min,
      fuente,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/repartidor/:id', verificarToken, checkRole(['admin', 'repartidor']), async (req, res) => {
  try {
    const repartidorId = req.params.id;
    const fecha = parseFecha(req.query?.fecha);

    if (req.user.rol === 'repartidor' && req.user.id !== repartidorId) {
      return res.status(403).json({ error: 'Solo puedes ver tu propia ruta' });
    }

    const { data: ruta, error: rutaError } = await supabase
      .from('rutas_dia')
      .select('id, repartidor_id, fecha, orden_guias, distancia_km, tiempo_min, estado, created_at')
      .eq('repartidor_id', repartidorId)
      .eq('fecha', fecha)
      .maybeSingle();

    if (rutaError) return res.status(500).json({ error: rutaError.message });
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada para la fecha indicada' });

    const guiaIds = Array.isArray(ruta.orden_guias) ? ruta.orden_guias : [];
    if (guiaIds.length === 0) {
      return res.json({ ...ruta, orden: [] });
    }

    const { data: guias, error: guiasError } = await supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, direccion_destinatario, barrio, ciudad_destino, telefono_destinatario, estado_actual, lat, lng')
      .in('id', guiaIds);

    if (guiasError) return res.status(500).json({ error: guiasError.message });

    const mapGuias = (guias || []).reduce((acc, g) => {
      acc[g.id] = g;
      return acc;
    }, {});

    const orden = guiaIds
      .map((id, index) => ({ posicion: index + 1, ...mapGuias[id] }))
      .filter((item) => item.id);

    return res.json({
      id: ruta.id,
      repartidor_id: ruta.repartidor_id,
      fecha: ruta.fecha,
      estado: ruta.estado,
      distancia_km: ruta.distancia_km,
      tiempo_min: ruta.tiempo_min,
      orden,
      created_at: ruta.created_at,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:ruta_id/orden', verificarToken, checkRole(['admin']), checkAdminPermission('rutas.manage'), async (req, res) => {
  try {
    const rutaId = req.params.ruta_id;
    const ordenGuias = Array.isArray(req.body?.orden_guias) ? req.body.orden_guias : [];

    if (!ordenGuias.length) {
      return res.status(400).json({ error: 'orden_guias debe contener al menos una guia' });
    }

    const { data: ruta, error: rutaError } = await supabase
      .from('rutas_dia')
      .select('id')
      .eq('id', rutaId)
      .maybeSingle();

    if (rutaError) return res.status(500).json({ error: rutaError.message });
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });

    const { data: updated, error: updateError } = await supabase
      .from('rutas_dia')
      .update({ orden_guias: ordenGuias })
      .eq('id', rutaId)
      .select('id, orden_guias')
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({ ruta_id: updated.id, orden_guias: updated.orden_guias });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
