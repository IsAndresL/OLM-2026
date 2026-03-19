const express = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();

function normalizeBarrio(value) {
  return String(value || '').trim();
}

async function fetchZonasFull() {
  const { data: zonas, error: zonasError } = await supabase
    .from('zonas')
    .select('id, nombre, descripcion, color, activa, created_at')
    .order('nombre', { ascending: true });

  if (zonasError) throw new Error(zonasError.message);
  if (!zonas || zonas.length === 0) return [];

  const zonaIds = zonas.map((z) => z.id);

  const { data: barrios, error: barriosError } = await supabase
    .from('zonas_barrios')
    .select('zona_id, barrio')
    .in('zona_id', zonaIds)
    .order('barrio', { ascending: true });
  if (barriosError) throw new Error(barriosError.message);

  const { data: asignaciones, error: asigError } = await supabase
    .from('zonas_repartidores')
    .select('zona_id, repartidor_id')
    .in('zona_id', zonaIds);
  if (asigError) throw new Error(asigError.message);

  const repartidorIds = [...new Set((asignaciones || []).map((a) => a.repartidor_id).filter(Boolean))];
  let repartidoresMap = {};

  if (repartidorIds.length > 0) {
    const { data: repartidores, error: repsError } = await supabase
      .from('usuarios')
      .select('id, nombre_completo')
      .in('id', repartidorIds);
    if (repsError) throw new Error(repsError.message);

    repartidoresMap = (repartidores || []).reduce((acc, r) => {
      acc[r.id] = { id: r.id, nombre_completo: r.nombre_completo };
      return acc;
    }, {});
  }

  return zonas.map((zona) => {
    const barriosZona = (barrios || [])
      .filter((b) => b.zona_id === zona.id)
      .map((b) => b.barrio);

    const repartidoresZona = (asignaciones || [])
      .filter((a) => a.zona_id === zona.id)
      .map((a) => repartidoresMap[a.repartidor_id])
      .filter(Boolean);

    return {
      ...zona,
      barrios: barriosZona,
      repartidores: repartidoresZona,
    };
  });
}

router.get('/', verificarToken, checkRole(['admin']), checkAdminPermission('zonas.manage'), async (_req, res) => {
  try {
    const data = await fetchZonasFull();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/', verificarToken, checkRole(['admin']), checkAdminPermission('zonas.manage'), async (req, res) => {
  try {
    const { nombre, descripcion, color, barrios = [] } = req.body || {};

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'nombre es requerido' });
    }

    const payload = {
      nombre: String(nombre).trim(),
      descripcion: descripcion ? String(descripcion).trim() : null,
      color: color || '#1D4ED8',
      activa: true,
    };

    const { data: zona, error } = await supabase
      .from('zonas')
      .insert(payload)
      .select('id, nombre, descripcion, color, activa')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const barriosNormalizados = [...new Set((Array.isArray(barrios) ? barrios : []).map(normalizeBarrio).filter(Boolean))];
    if (barriosNormalizados.length > 0) {
      const rows = barriosNormalizados.map((barrio) => ({ zona_id: zona.id, barrio }));
      const { error: barriosError } = await supabase.from('zonas_barrios').insert(rows);
      if (barriosError) return res.status(500).json({ error: barriosError.message });
    }

    return res.status(201).json({ ...zona, barrios: barriosNormalizados, repartidores: [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, checkRole(['admin']), checkAdminPermission('zonas.manage'), async (req, res) => {
  try {
    const zonaId = req.params.id;
    const { nombre, descripcion, color, barrios, repartidores } = req.body || {};

    const updateData = {};
    if (nombre != null) updateData.nombre = String(nombre).trim();
    if (descripcion !== undefined) updateData.descripcion = descripcion ? String(descripcion).trim() : null;
    if (color != null) updateData.color = color;

    if (Object.keys(updateData).length > 0) {
      const { error: zonaError } = await supabase
        .from('zonas')
        .update(updateData)
        .eq('id', zonaId);
      if (zonaError) return res.status(500).json({ error: zonaError.message });
    }

    if (Array.isArray(barrios)) {
      const { error: delBarriosError } = await supabase
        .from('zonas_barrios')
        .delete()
        .eq('zona_id', zonaId);
      if (delBarriosError) return res.status(500).json({ error: delBarriosError.message });

      const list = [...new Set(barrios.map(normalizeBarrio).filter(Boolean))];
      if (list.length > 0) {
        const rows = list.map((barrio) => ({ zona_id: zonaId, barrio }));
        const { error: insBarriosError } = await supabase.from('zonas_barrios').insert(rows);
        if (insBarriosError) return res.status(500).json({ error: insBarriosError.message });
      }
    }

    if (Array.isArray(repartidores)) {
      const { error: delRepError } = await supabase
        .from('zonas_repartidores')
        .delete()
        .eq('zona_id', zonaId);
      if (delRepError) return res.status(500).json({ error: delRepError.message });

      const ids = [...new Set(repartidores.filter(Boolean))];
      if (ids.length > 0) {
        const rows = ids.map((repartidor_id) => ({ zona_id: zonaId, repartidor_id }));
        const { error: insRepError } = await supabase.from('zonas_repartidores').insert(rows);
        if (insRepError) return res.status(500).json({ error: insRepError.message });
      }
    }

    const zonas = await fetchZonasFull();
    const zona = zonas.find((z) => z.id === zonaId);
    if (!zona) return res.status(404).json({ error: 'Zona no encontrada' });

    return res.json(zona);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, checkRole(['admin']), checkAdminPermission('zonas.manage'), async (req, res) => {
  try {
    const zonaId = req.params.id;
    const { error } = await supabase
      .from('zonas')
      .update({ activa: false })
      .eq('id', zonaId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, id: zonaId, activa: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/detectar', verificarToken, checkRole(['admin', 'empresa']), async (req, res) => {
  try {
    const barrio = normalizeBarrio(req.query?.barrio);
    if (!barrio) return res.json(null);

    const { data: rows, error } = await supabase
      .from('zonas_barrios')
      .select('zona_id, barrio, zonas(id, nombre, activa)')
      .ilike('barrio', barrio)
      .limit(1);

    if (error) return res.status(500).json({ error: error.message });

    const row = rows?.[0];
    if (!row || !row.zonas || row.zonas.activa === false) return res.json(null);

    return res.json({ zona_id: row.zonas.id, zona_nombre: row.zonas.nombre });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
