const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function toIsoNowMinusHours(hours) {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function formatElapsed(value) {
  if (!value) return 'sin registro';
  const now = Date.now();
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'sin registro';

  const diffMs = Math.max(0, now - then);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `${days} d`;
}

function dayRange(fecha) {
  return {
    desde: `${fecha}T00:00:00`,
    hasta: `${fecha}T23:59:59`,
  };
}

router.put('/ubicacion', verificarToken, checkRole(['repartidor']), async (req, res) => {
  try {
    const lat = asNumber(req.body?.lat);
    const lng = asNumber(req.body?.lng);
    const precision = asNumber(req.body?.precision_m);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat y lng son obligatorios y deben ser numéricos' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'lat/lng fuera de rango válido' });
    }

    const payload = {
      repartidor_id: req.user.id,
      lat,
      lng,
      precision_m: Number.isFinite(precision) ? Math.round(precision) : null,
      activo: true,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('ubicaciones_repartidor')
      .upsert(payload, { onConflict: 'repartidor_id' });

    if (upsertError) return res.status(500).json({ error: upsertError.message });

    const { error: histError } = await supabase
      .from('historial_ubicaciones')
      .insert({ repartidor_id: req.user.id, lat, lng });

    if (histError) return res.status(500).json({ error: histError.message });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/ubicacion', verificarToken, checkRole(['repartidor']), async (req, res) => {
  try {
    const { error } = await supabase
      .from('ubicaciones_repartidor')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('repartidor_id', req.user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/repartidores', verificarToken, checkRole(['admin']), checkAdminPermission('mapa.view'), async (req, res) => {
  try {
    const { data: ubicaciones, error } = await supabase
      .from('ubicaciones_repartidor')
      .select('repartidor_id, lat, lng, precision_m, updated_at, activo')
      .eq('activo', true)
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    if (!ubicaciones || ubicaciones.length === 0) return res.json([]);

    const repartidorIds = [...new Set(ubicaciones.map((u) => u.repartidor_id).filter(Boolean))];

    const { data: usuarios, error: usersError } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, avatar_url')
      .in('id', repartidorIds);

    if (usersError) return res.status(500).json({ error: usersError.message });

    const usersMap = (usuarios || []).reduce((acc, u) => {
      acc[u.id] = {
        nombre_completo: u.nombre_completo,
        avatar_url: u.avatar_url || null,
      };
      return acc;
    }, {});

    const hoy = new Date().toISOString().slice(0, 10);
    const conteos = await Promise.all(repartidorIds.map(async (id) => {
      const { count } = await supabase
        .from('guias')
        .select('id', { count: 'exact', head: true })
        .eq('repartidor_id', id)
        .eq('estado_actual', 'en_ruta')
        .gte('created_at', `${hoy}T00:00:00`)
        .lte('created_at', `${hoy}T23:59:59`);
      return { id, count: count || 0 };
    }));

    const conteosMap = conteos.reduce((acc, row) => {
      acc[row.id] = row.count;
      return acc;
    }, {});

    const result = ubicaciones.map((u) => ({
      repartidor_id: u.repartidor_id,
      nombre_completo: usersMap[u.repartidor_id]?.nombre_completo || 'Sin nombre',
      avatar_url: usersMap[u.repartidor_id]?.avatar_url || null,
      lat: Number(u.lat),
      lng: Number(u.lng),
      precision_m: u.precision_m,
      updated_at: u.updated_at,
      guias_activas: conteosMap[u.repartidor_id] || 0,
      ultimo_estado_hace: formatElapsed(u.updated_at),
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/public/:token/ubicacion', async (req, res) => {
  try {
    const { token } = req.params;

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_err) {
      return res.status(401).json({ error: 'Token de tracking inválido o expirado' });
    }

    if (!decoded || decoded.scope !== 'tracking_public' || !decoded.rid) {
      return res.status(401).json({ error: 'Token de tracking inválido' });
    }

    const { data, error } = await supabase
      .from('ubicaciones_repartidor')
      .select('lat, lng, activo')
      .eq('repartidor_id', decoded.rid)
      .eq('activo', true)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Ubicacion no disponible' });

    return res.json({ lat: Number(data.lat), lng: Number(data.lng), activo: Boolean(data.activo) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/repartidor/:id/historial', verificarToken, checkRole(['admin']), checkAdminPermission('mapa.view'), async (req, res) => {
  try {
    const { id } = req.params;
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const { desde, hasta } = dayRange(fecha);

    const { data, error } = await supabase
      .from('historial_ubicaciones')
      .select('lat, lng, created_at')
      .eq('repartidor_id', id)
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const result = (data || []).map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lng),
      created_at: row.created_at,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
