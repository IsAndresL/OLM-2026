const express = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();
const COD_METODOS = ['efectivo', 'transferencia', 'nequi', 'daviplata'];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function dayRange(fecha) {
  return {
    desde: `${fecha}T00:00:00`,
    hasta: `${fecha}T23:59:59`,
  };
}

router.post('/guia/:guia_id/activar', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('guias.edit'), async (req, res) => {
  try {
    const { guia_id } = req.params;
    const montoCod = toNumber(req.body?.monto_cod);

    if (!Number.isFinite(montoCod) || montoCod <= 0) {
      return res.status(400).json({ error: 'monto_cod debe ser mayor a cero' });
    }

    const { data: guia, error: guiaError } = await supabase
      .from('guias')
      .select('id, empresa_id, estado_actual')
      .eq('id', guia_id)
      .single();

    if (guiaError || !guia) return res.status(404).json({ error: 'Guia no encontrada' });

    if (req.user.rol === 'empresa' && guia.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Sin acceso a esta guia' });
    }

    if (!['registrado', 'asignado'].includes(guia.estado_actual)) {
      return res.status(409).json({ error: 'Solo puedes activar COD para guias registradas o asignadas' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('guias')
      .update({
        es_cod: true,
        monto_cod: montoCod,
        cod_estado: 'pendiente',
      })
      .eq('id', guia_id)
      .select('id, monto_cod, es_cod')
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({
      guia_id: updated.id,
      monto_cod: updated.monto_cod,
      es_cod: updated.es_cod,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/guia/:guia_id/registrar-cobro', verificarToken, checkRole(['repartidor']), async (req, res) => {
  try {
    const { guia_id } = req.params;
    const codCobrado = toNumber(req.body?.cod_cobrado);
    const codMetodo = req.body?.cod_metodo;

    if (!Number.isFinite(codCobrado) || codCobrado <= 0) {
      return res.status(400).json({ error: 'cod_cobrado debe ser mayor a cero' });
    }

    if (!COD_METODOS.includes(codMetodo)) {
      return res.status(400).json({ error: 'cod_metodo no es valido' });
    }

    const { data: guia, error: guiaError } = await supabase
      .from('guias')
      .select('id, repartidor_id, es_cod, estado_actual')
      .eq('id', guia_id)
      .single();

    if (guiaError || !guia) return res.status(404).json({ error: 'Guia no encontrada' });
    if (guia.repartidor_id !== req.user.id) return res.status(403).json({ error: 'Esta guia no te pertenece' });
    if (!guia.es_cod) return res.status(409).json({ error: 'Esta guia no tiene COD activo' });
    if (guia.estado_actual !== 'entregado') return res.status(409).json({ error: 'La guia debe estar entregada para registrar cobro COD' });

    const { data: updated, error: updateError } = await supabase
      .from('guias')
      .update({
        cod_cobrado: codCobrado,
        cod_metodo: codMetodo,
        cod_estado: 'cobrado',
      })
      .eq('id', guia_id)
      .select('id, cod_cobrado, cod_metodo, cod_estado')
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({
      guia_id: updated.id,
      cod_cobrado: updated.cod_cobrado,
      cod_metodo: updated.cod_metodo,
      cod_estado: updated.cod_estado,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/repartidor/pendientes', verificarToken, checkRole(['repartidor']), async (req, res) => {
  try {
    const { data: guias, error: guiasError } = await supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, monto_cod, cod_cobrado, cod_metodo')
      .eq('repartidor_id', req.user.id)
      .eq('es_cod', true)
      .eq('cod_estado', 'cobrado')
      .order('updated_at', { ascending: false });

    if (guiasError) return res.status(500).json({ error: guiasError.message });
    if (!guias || guias.length === 0) return res.json([]);

    const guiaIds = guias.map((g) => g.id);
    const { data: historial, error: historialError } = await supabase
      .from('historial_estados')
      .select('guia_id, created_at')
      .in('guia_id', guiaIds)
      .eq('estado', 'entregado')
      .order('created_at', { ascending: false });

    if (historialError) return res.status(500).json({ error: historialError.message });

    const entregaByGuia = {};
    for (const row of historial || []) {
      if (!entregaByGuia[row.guia_id]) entregaByGuia[row.guia_id] = row.created_at;
    }

    const result = guias.map((guia) => ({
      guia_id: guia.id,
      numero_guia: guia.numero_guia,
      nombre_destinatario: guia.nombre_destinatario,
      monto_cod: guia.monto_cod,
      cod_cobrado: guia.cod_cobrado,
      cod_metodo: guia.cod_metodo,
      fecha_entrega: entregaByGuia[guia.id] || null,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/resumen-admin', verificarToken, checkRole(['admin']), checkAdminPermission('caja_cod.view'), async (req, res) => {
  try {
    const { empresa_id } = req.query;

    let guiasQuery = supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, empresa_id, repartidor_id, monto_cod, cod_cobrado, cod_estado, estado_actual, updated_at')
      .eq('es_cod', true)
      .not('repartidor_id', 'is', null)
      .in('cod_estado', ['pendiente', 'cobrado'])
      .order('updated_at', { ascending: false });

    if (empresa_id) guiasQuery = guiasQuery.eq('empresa_id', empresa_id);

    const { data: guias, error: guiasError } = await guiasQuery;

    if (guiasError) return res.status(500).json({ error: guiasError.message });

    const repartidorIds = [...new Set((guias || []).map((g) => g.repartidor_id).filter(Boolean))];
    let repartidoresMap = {};

    if (repartidorIds.length > 0) {
      const { data: repartidores, error: repError } = await supabase
        .from('usuarios')
        .select('id, nombre_completo')
        .in('id', repartidorIds);

      if (repError) return res.status(500).json({ error: repError.message });
      repartidoresMap = (repartidores || []).reduce((acc, row) => {
        acc[row.id] = row.nombre_completo;
        return acc;
      }, {});
    }

    const porGuia = (guias || []).map((g) => {
      const monto = Number(g.cod_cobrado || g.monto_cod || 0);
      return {
        guia_id: g.id,
        numero_guia: g.numero_guia,
        nombre_destinatario: g.nombre_destinatario,
        repartidor_id: g.repartidor_id,
        repartidor_nombre: repartidoresMap[g.repartidor_id] || 'Sin nombre',
        cod_estado: g.cod_estado,
        estado_actual: g.estado_actual,
        monto,
        updated_at: g.updated_at,
      };
    });

    const porRepartidorObj = porGuia.reduce((acc, row) => {
      if (!acc[row.repartidor_id]) {
        acc[row.repartidor_id] = {
          repartidor_id: row.repartidor_id,
          repartidor_nombre: row.repartidor_nombre,
          total_monto: 0,
          total_guias: 0,
          pendientes_cobro: 0,
          cobradas_no_entregadas: 0,
        };
      }
      acc[row.repartidor_id].total_monto += row.monto;
      acc[row.repartidor_id].total_guias += 1;
      if (row.cod_estado === 'pendiente') acc[row.repartidor_id].pendientes_cobro += 1;
      if (row.cod_estado === 'cobrado') acc[row.repartidor_id].cobradas_no_entregadas += 1;
      return acc;
    }, {});

    const porRepartidor = Object.values(porRepartidorObj)
      .map((r) => ({ ...r, total_monto: Number(r.total_monto.toFixed(2)) }))
      .sort((a, b) => b.total_monto - a.total_monto);

    const totalEnCirculacion = Number(
      porGuia.reduce((acc, row) => acc + Number(row.monto || 0), 0).toFixed(2)
    );

    return res.json({
      total_en_circulacion: totalEnCirculacion,
      total_guias_en_circulacion: porGuia.length,
      por_repartidor: porRepartidor,
      por_guia: porGuia,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/corte-caja', verificarToken, checkRole(['repartidor']), async (req, res) => {
  try {
    const guiaIdsRaw = Array.isArray(req.body?.guia_ids) ? req.body.guia_ids : [];
    const guiaIds = [...new Set(guiaIdsRaw.filter(Boolean))];
    const montoDeclarado = toNumber(req.body?.monto_declarado);

    if (guiaIds.length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos una guia COD' });
    }

    if (!Number.isFinite(montoDeclarado) || montoDeclarado <= 0) {
      return res.status(400).json({ error: 'monto_declarado debe ser mayor a cero' });
    }

    const { data: guias, error: guiasError } = await supabase
      .from('guias')
      .select('id, cod_cobrado, repartidor_id, cod_estado, es_cod')
      .in('id', guiaIds);

    if (guiasError) return res.status(500).json({ error: guiasError.message });
    if (!guias || guias.length !== guiaIds.length) {
      return res.status(400).json({ error: 'Una o mas guias no existen' });
    }

    const invalid = guias.find((g) => (
      g.repartidor_id !== req.user.id ||
      !g.es_cod ||
      g.cod_estado !== 'cobrado'
    ));

    if (invalid) {
      return res.status(409).json({ error: 'Solo puedes incluir guias COD cobradas que te pertenezcan' });
    }

    const { data: corte, error: corteError } = await supabase
      .from('cortes_caja')
      .insert({
        repartidor_id: req.user.id,
        monto_declarado: montoDeclarado,
        guias_cod: guiaIds,
        estado: 'pendiente',
      })
      .select('id, monto_declarado')
      .single();

    if (corteError) return res.status(500).json({ error: corteError.message });

    const { error: updateError } = await supabase
      .from('guias')
      .update({ cod_estado: 'entregado_sede' })
      .in('id', guiaIds);

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.status(201).json({
      corte_id: corte.id,
      monto_declarado: corte.monto_declarado,
      total_guias: guiaIds.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/cortes', verificarToken, checkRole(['admin']), checkAdminPermission('caja_cod.view'), async (req, res) => {
  try {
    const { estado, repartidor_id, empresa_id } = req.query;

    let query = supabase
      .from('cortes_caja')
      .select('id, repartidor_id, monto_declarado, monto_recibido, diferencia, estado, guias_cod, created_at')
      .order('created_at', { ascending: false });

    if (estado) query = query.eq('estado', estado);
    if (repartidor_id) query = query.eq('repartidor_id', repartidor_id);

    const { data: cortes, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    let cortesNormalizados = cortes || [];

    if (empresa_id) {
      const guiaIds = [
        ...new Set(
          cortesNormalizados
            .flatMap((c) => (Array.isArray(c.guias_cod) ? c.guias_cod : []))
            .filter(Boolean)
        ),
      ];

      let guiasById = {};
      if (guiaIds.length > 0) {
        const { data: guias, error: guiasError } = await supabase
          .from('guias')
          .select('id, empresa_id, monto_cod, cod_cobrado')
          .in('id', guiaIds);

        if (guiasError) return res.status(500).json({ error: guiasError.message });
        guiasById = (guias || []).reduce((acc, g) => {
          acc[g.id] = g;
          return acc;
        }, {});
      }

      cortesNormalizados = cortesNormalizados
        .map((corte) => {
          const guiasFiltradas = (Array.isArray(corte.guias_cod) ? corte.guias_cod : []).filter((id) => {
            const guia = guiasById[id];
            return guia && String(guia.empresa_id) === String(empresa_id);
          });

          const montoFiltrado = Number(
            guiasFiltradas
              .reduce((acc, id) => {
                const guia = guiasById[id];
                return acc + Number(guia?.cod_cobrado || guia?.monto_cod || 0);
              }, 0)
              .toFixed(2)
          );

          return {
            ...corte,
            guias_cod: guiasFiltradas,
            monto_declarado: montoFiltrado,
            monto_recibido: montoFiltrado,
            diferencia: 0,
          };
        })
        .filter((corte) => (corte.guias_cod || []).length > 0);
    }

    const repartidorIds = [...new Set((cortesNormalizados || []).map((c) => c.repartidor_id).filter(Boolean))];
    let repartidoresMap = {};

    if (repartidorIds.length > 0) {
      const { data: repartidores, error: repartidoresError } = await supabase
        .from('usuarios')
        .select('id, nombre_completo')
        .in('id', repartidorIds);

      if (repartidoresError) return res.status(500).json({ error: repartidoresError.message });
      repartidoresMap = (repartidores || []).reduce((acc, row) => {
        acc[row.id] = row.nombre_completo;
        return acc;
      }, {});
    }

    const result = (cortesNormalizados || []).map((corte) => ({
      id: corte.id,
      repartidor: {
        id: corte.repartidor_id,
        nombre: repartidoresMap[corte.repartidor_id] || 'Sin nombre',
      },
      monto_declarado: corte.monto_declarado,
      monto_recibido: corte.monto_recibido,
      diferencia: corte.diferencia,
      estado: corte.estado,
      total_guias: Array.isArray(corte.guias_cod) ? corte.guias_cod.length : 0,
      guias_cod: Array.isArray(corte.guias_cod) ? corte.guias_cod : [],
      created_at: corte.created_at,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/cortes/:corte_id/verificar', verificarToken, checkRole(['admin']), checkAdminPermission('caja_cod.manage'), async (req, res) => {
  try {
    const { corte_id } = req.params;
    const montoRecibido = toNumber(req.body?.monto_recibido);
    const observaciones = req.body?.observaciones || null;

    if (!Number.isFinite(montoRecibido) || montoRecibido < 0) {
      return res.status(400).json({ error: 'monto_recibido no es valido' });
    }

    const { data: corte, error: findError } = await supabase
      .from('cortes_caja')
      .select('id, monto_declarado')
      .eq('id', corte_id)
      .single();

    if (findError || !corte) return res.status(404).json({ error: 'Corte no encontrado' });

    const nuevoEstado = Number(montoRecibido) === Number(corte.monto_declarado)
      ? 'verificado'
      : 'discrepancia';

    const { data: updated, error: updateError } = await supabase
      .from('cortes_caja')
      .update({
        monto_recibido: montoRecibido,
        estado: nuevoEstado,
        observaciones,
        admin_id: req.user.id,
      })
      .eq('id', corte_id)
      .select('id, diferencia, estado')
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({
      corte_id: updated.id,
      diferencia: updated.diferencia,
      estado: updated.estado,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/cortes/:corte_id', verificarToken, checkRole(['admin']), checkAdminPermission('caja_cod.view'), async (req, res) => {
  try {
    const { corte_id } = req.params;
    const { data: corte, error: corteError } = await supabase
      .from('cortes_caja')
      .select('id, repartidor_id, monto_declarado, monto_recibido, diferencia, estado, guias_cod, observaciones, created_at')
      .eq('id', corte_id)
      .single();

    if (corteError || !corte) return res.status(404).json({ error: 'Corte no encontrado' });

    const guiaIds = Array.isArray(corte.guias_cod) ? corte.guias_cod : [];
    let guias = [];

    if (guiaIds.length > 0) {
      const { data: guiasData, error: guiasError } = await supabase
        .from('guias')
        .select('id, numero_guia, nombre_destinatario, monto_cod, cod_cobrado')
        .in('id', guiaIds);

      if (guiasError) return res.status(500).json({ error: guiasError.message });
      guias = guiasData || [];
    }

    return res.json({ ...corte, guias });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
