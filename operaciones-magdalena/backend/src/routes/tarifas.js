const express = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();

function toMoney(value, fallback = null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

router.get('/repartidores', verificarToken, checkRole(['admin']), checkAdminPermission('tarifas.manage'), async (_req, res) => {
  try {
    const { data: repartidores, error: repError } = await supabase
      .from('usuarios')
      .select('id, nombre_completo')
      .eq('rol', 'repartidor')
      .eq('activo', true)
      .order('nombre_completo', { ascending: true });

    if (repError) return res.status(500).json({ error: repError.message });

    const repIds = (repartidores || []).map((r) => r.id);
    let tarifasMap = {};

    if (repIds.length > 0) {
      const { data: tarifas, error: tarifaError } = await supabase
        .from('tarifas_repartidor')
        .select('repartidor_id, tarifa_base, tarifa_novedad')
        .eq('activa', true)
        .in('repartidor_id', repIds);

      if (tarifaError) return res.status(500).json({ error: tarifaError.message });

      tarifasMap = (tarifas || []).reduce((acc, row) => {
        acc[row.repartidor_id] = {
          tarifa_base: row.tarifa_base,
          tarifa_novedad: row.tarifa_novedad,
        };
        return acc;
      }, {});
    }

    const result = (repartidores || []).map((rep) => ({
      repartidor: { id: rep.id, nombre_completo: rep.nombre_completo },
      tarifa: tarifasMap[rep.id] || null,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/repartidores/:repartidor_id', verificarToken, checkRole(['admin']), checkAdminPermission('tarifas.manage'), async (req, res) => {
  try {
    const { repartidor_id } = req.params;
    const tarifaBase = toMoney(req.body?.tarifa_base);
    const tarifaNovedad = toMoney(req.body?.tarifa_novedad, 0);

    if (tarifaBase === null || tarifaNovedad === null) {
      return res.status(400).json({ error: 'Las tarifas deben ser numeros positivos' });
    }

    const { data: repartidor, error: repError } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('id', repartidor_id)
      .single();

    if (repError || !repartidor) return res.status(404).json({ error: 'Repartidor no encontrado' });
    if (repartidor.rol !== 'repartidor') return res.status(400).json({ error: 'El usuario no es repartidor' });

    const { data: actual, error: actualError } = await supabase
      .from('tarifas_repartidor')
      .select('id')
      .eq('repartidor_id', repartidor_id)
      .eq('activa', true)
      .maybeSingle();

    if (actualError) return res.status(500).json({ error: actualError.message });

    if (actual?.id) {
      const { error: updateError } = await supabase
        .from('tarifas_repartidor')
        .update({ tarifa_base: tarifaBase, tarifa_novedad: tarifaNovedad })
        .eq('id', actual.id);

      if (updateError) return res.status(500).json({ error: updateError.message });
    } else {
      const { error: insertError } = await supabase
        .from('tarifas_repartidor')
        .insert({ repartidor_id, tarifa_base: tarifaBase, tarifa_novedad: tarifaNovedad, activa: true });

      if (insertError) return res.status(500).json({ error: insertError.message });
    }

    return res.json({ repartidor_id, tarifa_base: tarifaBase, tarifa_novedad: tarifaNovedad });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/empresas', verificarToken, checkRole(['admin']), checkAdminPermission('tarifas.manage'), async (_req, res) => {
  try {
    const { data: empresas, error: empError } = await supabase
      .from('empresas')
      .select('id, nombre')
      .order('nombre', { ascending: true });

    if (empError) return res.status(500).json({ error: empError.message });

    const empresaIds = (empresas || []).map((e) => e.id);
    let tarifasMap = {};

    if (empresaIds.length > 0) {
      const { data: tarifas, error: tarifaError } = await supabase
        .from('tarifas_empresa')
        .select('empresa_id, tarifa_base, tarifa_cod')
        .eq('activa', true)
        .in('empresa_id', empresaIds);

      if (tarifaError) return res.status(500).json({ error: tarifaError.message });

      tarifasMap = (tarifas || []).reduce((acc, row) => {
        acc[row.empresa_id] = {
          tarifa_base: row.tarifa_base,
          tarifa_cod: row.tarifa_cod,
        };
        return acc;
      }, {});
    }

    const result = (empresas || []).map((empresa) => ({
      empresa: { id: empresa.id, nombre: empresa.nombre },
      tarifa: tarifasMap[empresa.id] || null,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/empresas/:empresa_id', verificarToken, checkRole(['admin']), checkAdminPermission('tarifas.manage'), async (req, res) => {
  try {
    const { empresa_id } = req.params;
    const tarifaBase = toMoney(req.body?.tarifa_base);
    const tarifaCod = toMoney(req.body?.tarifa_cod, 0);

    if (tarifaBase === null || tarifaCod === null) {
      return res.status(400).json({ error: 'Las tarifas deben ser numeros positivos' });
    }

    const { data: empresa, error: empError } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', empresa_id)
      .single();

    if (empError || !empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { data: actual, error: actualError } = await supabase
      .from('tarifas_empresa')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('activa', true)
      .maybeSingle();

    if (actualError) return res.status(500).json({ error: actualError.message });

    if (actual?.id) {
      const { error: updateError } = await supabase
        .from('tarifas_empresa')
        .update({ tarifa_base: tarifaBase, tarifa_cod: tarifaCod })
        .eq('id', actual.id);

      if (updateError) return res.status(500).json({ error: updateError.message });
    } else {
      const { error: insertError } = await supabase
        .from('tarifas_empresa')
        .insert({ empresa_id, tarifa_base: tarifaBase, tarifa_cod: tarifaCod, activa: true });

      if (insertError) return res.status(500).json({ error: insertError.message });
    }

    return res.json({ empresa_id, tarifa_base: tarifaBase, tarifa_cod: tarifaCod });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
