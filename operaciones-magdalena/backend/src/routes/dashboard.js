const express = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA');
}

// GET /api/v1/dashboard/resumen - Resumen general (Admin)
router.get('/resumen', verificarToken, checkRole(['admin']), checkAdminPermission('dashboard.view'), async (req, res) => {
  try {
    const today = new Date();
    const fechaParam = req.query.fecha || today.toLocaleDateString('en-CA');
    const empresaId = req.query.empresa_id || null;
    const repartidorId = req.query.repartidor_id || null;

    const fechaInicio = `${fechaParam}T00:00:00`;
    const fechaFin = `${fechaParam}T23:59:59`;

    let guiasQuery = supabase
      .from('guias')
      .select('id, empresa_id, repartidor_id, estado_actual, created_at, updated_at, numero_guia, nombre_destinatario')
      .order('created_at', { ascending: false });

    if (empresaId) guiasQuery = guiasQuery.eq('empresa_id', empresaId);
    if (repartidorId) guiasQuery = guiasQuery.eq('repartidor_id', repartidorId);

    const { data: todasGuias, error: guiasError } = await guiasQuery;
    if (guiasError) throw guiasError;

    const guiaIds = (todasGuias || []).map((g) => g.id);
    let historialHoy = [];

    if (guiaIds.length > 0) {
      const { data: historialData, error: histError } = await supabase
        .from('historial_estados')
        .select('guia_id, estado, created_at, usuario_id')
        .in('guia_id', guiaIds)
        .gte('created_at', fechaInicio)
        .lte('created_at', fechaFin)
        .order('created_at', { ascending: false });

      if (histError) throw histError;
      historialHoy = historialData || [];
    }

    const creadasHoy = (todasGuias || []).filter((g) => g.created_at >= fechaInicio && g.created_at <= fechaFin).length;
    const total_asignadas = (todasGuias || []).filter((g) => g.estado_actual === 'asignado').length;
    const total_en_ruta = (todasGuias || []).filter((g) => g.estado_actual === 'en_ruta').length;
    const sin_asignar = (todasGuias || []).filter((g) => g.estado_actual === 'registrado').length;

    const guiasEntregadasHoy = new Set();
    const guiasDevueltasHoy = new Set();
    const guiasNovedadesHoy = new Set();

    historialHoy.forEach((h) => {
      if (h.estado === 'entregado') guiasEntregadasHoy.add(h.guia_id);
      if (h.estado === 'devuelto') guiasDevueltasHoy.add(h.guia_id);
      if (['no_contesto', 'direccion_incorrecta', 'reagendar'].includes(h.estado)) guiasNovedadesHoy.add(h.guia_id);
    });

    const entregadasCount = guiasEntregadasHoy.size;
    const novedadesCount = guiasNovedadesHoy.size;
    const devueltasCount = guiasDevueltasHoy.size;
    const baseTasa = entregadasCount + novedadesCount + devueltasCount;
    const tasa = baseTasa > 0 ? ((entregadasCount / baseTasa) * 100).toFixed(1) + '%' : '0.0%';

    let repQuery = supabase.from('usuarios').select('id, nombre_completo, activo').eq('rol', 'repartidor');
    if (repartidorId) repQuery = repQuery.eq('id', repartidorId);
    const { data: repartidores } = await repQuery;

    const por_repartidor = (repartidores || []).map((rep) => {
      const repAsignadasHoy = new Set();
      const repEntregadasHoy = new Set();
      const repNovedadesHoy = new Set();

      historialHoy
        .filter((h) => h.usuario_id === rep.id)
        .forEach((h) => {
          if (h.estado === 'asignado' || h.estado === 'en_ruta') repAsignadasHoy.add(h.guia_id);
          if (h.estado === 'entregado') repEntregadasHoy.add(h.guia_id);
          if (['no_contesto', 'direccion_incorrecta', 'reagendar'].includes(h.estado)) repNovedadesHoy.add(h.guia_id);
        });

      const entregadas = repEntregadasHoy.size;
      const novedades = repNovedadesHoy.size;
      const tasaRep = entregadas + novedades > 0 ? ((entregadas / (entregadas + novedades)) * 100).toFixed(1) + '%' : '0.0%';

      return {
        repartidor_id: rep.id,
        nombre_completo: rep.nombre_completo,
        asignadas: repAsignadasHoy.size,
        entregadas,
        novedades,
        tasa: tasaRep,
        activo: rep.activo,
      };
    });

    const { data: usuariosEmpresaActivos } = await supabase
      .from('usuarios')
      .select('empresa_id')
      .eq('rol', 'empresa')
      .eq('activo', true)
      .not('empresa_id', 'is', null);

    const empresaIdsActivasPorUsuario = [...new Set((usuariosEmpresaActivos || []).map((u) => u.empresa_id).filter(Boolean))];
    let empresas = [];

    if (empresaIdsActivasPorUsuario.length > 0) {
      let empQuery = supabase
        .from('empresas')
        .select('id, nombre')
        .eq('activa', true)
        .in('id', empresaIdsActivasPorUsuario);

      if (empresaId) empQuery = empQuery.eq('id', empresaId);

      const { data: empresasData } = await empQuery;
      empresas = empresasData || [];
    }

    const guiasById = new Map((todasGuias || []).map((g) => [g.id, g]));
    const por_empresa = (empresas || []).map((emp) => {
      const activas = (todasGuias || []).filter((g) => g.empresa_id === emp.id && !['entregado', 'devuelto'].includes(g.estado_actual)).length;

      const entregadasHoyEmp = Array.from(guiasEntregadasHoy).filter((guiaId) => {
        const g = guiasById.get(guiaId);
        return g && g.empresa_id === emp.id;
      }).length;

      return {
        empresa_id: emp.id,
        nombre: emp.nombre,
        activas,
        entregadas_hoy: entregadasHoyEmp,
      };
    });

    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let alertasQuery = supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, updated_at, estado_actual')
      .in('estado_actual', ['asignado', 'en_ruta', 'no_contesto', 'reagendar'])
      .lt('updated_at', limite24h)
      .order('updated_at', { ascending: true })
      .limit(10);

    if (empresaId) alertasQuery = alertasQuery.eq('empresa_id', empresaId);
    if (repartidorId) alertasQuery = alertasQuery.eq('repartidor_id', repartidorId);

    const { data: guiasEstancadas } = await alertasQuery;

    const alertas = (guiasEstancadas || []).map((g) => {
      const horas = Math.floor((Date.now() - new Date(g.updated_at).getTime()) / (1000 * 60 * 60));
      return {
        guia_id: g.id,
        numero_guia: g.numero_guia,
        nombre_destinatario: g.nombre_destinatario,
        estado_actual: g.estado_actual,
        horas_sin_movimiento: horas,
      };
    });

    return res.json({
      fecha: fechaParam,
      filtros: {
        empresa_id: empresaId,
        repartidor_id: repartidorId,
      },
      kpis: {
        total_registradas: creadasHoy,
        total_asignadas,
        total_en_ruta,
        total_entregadas: entregadasCount,
        total_novedades: novedadesCount,
        total_devueltas: devueltasCount,
        tasa_efectividad: tasa,
        sin_asignar,
      },
      por_repartidor,
      por_empresa,
      alertas,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/dashboard/tendencia - Gráfico de barras
router.get('/tendencia', verificarToken, checkRole(['admin']), checkAdminPermission('dashboard.view'), async (req, res) => {
  try {
    const dias = parseInt(req.query.dias, 10) || 30;
    const empresaId = req.query.empresa_id || null;
    const repartidorId = req.query.repartidor_id || null;
    const fechaDesde = toIsoDate(req.query.fecha_desde);
    const fechaHasta = toIsoDate(req.query.fecha_hasta);

    let startDate;
    let endDate;

    if (fechaDesde && fechaHasta) {
      startDate = new Date(`${fechaDesde}T00:00:00`);
      endDate = new Date(`${fechaHasta}T23:59:59`);
    } else {
      const limitDays = Math.min(Math.max(dias, 1), 180);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - limitDays + 1);
      startDate.setHours(0, 0, 0, 0);
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: 'Rango de fechas invalido' });
    }

    const strStart = startDate.toISOString();
    const strEnd = endDate.toISOString();

    let guiasRangoQuery = supabase
      .from('guias')
      .select('id, created_at')
      .gte('created_at', strStart)
      .lte('created_at', strEnd);

    if (empresaId) guiasRangoQuery = guiasRangoQuery.eq('empresa_id', empresaId);
    if (repartidorId) guiasRangoQuery = guiasRangoQuery.eq('repartidor_id', repartidorId);

    let filteredGuideIds = null;
    if (empresaId || repartidorId) {
      let idsQuery = supabase.from('guias').select('id');
      if (empresaId) idsQuery = idsQuery.eq('empresa_id', empresaId);
      if (repartidorId) idsQuery = idsQuery.eq('repartidor_id', repartidorId);
      const { data: idRows, error: idsError } = await idsQuery;
      if (idsError) throw idsError;
      filteredGuideIds = (idRows || []).map((g) => g.id);
    }

    let historialQuery = supabase
      .from('historial_estados')
      .select('guia_id, estado, created_at')
      .gte('created_at', strStart)
      .lte('created_at', strEnd);

    if (filteredGuideIds && filteredGuideIds.length === 0) {
      historialQuery = historialQuery.eq('id', 'uuid-imposible');
    } else if (filteredGuideIds && filteredGuideIds.length > 0) {
      historialQuery = historialQuery.in('guia_id', filteredGuideIds);
    }

    const [resGuias, resHist] = await Promise.all([guiasRangoQuery, historialQuery]);
    if (resGuias.error) throw resGuias.error;
    if (resHist.error) throw resHist.error;

    const seriesMap = {};
    const pivotDate = new Date(startDate);
    while (pivotDate <= endDate) {
      const isoDate = pivotDate.toLocaleDateString('en-CA');
      seriesMap[isoDate] = { fecha: isoDate, registradas: 0, entregadas: 0, novedades: 0, devueltas: 0 };
      pivotDate.setDate(pivotDate.getDate() + 1);
    }

    (resGuias.data || []).forEach((g) => {
      const d = g.created_at.substring(0, 10);
      if (seriesMap[d]) seriesMap[d].registradas++;
    });

    (resHist.data || []).forEach((h) => {
      const d = h.created_at.substring(0, 10);
      if (!seriesMap[d]) return;
      if (h.estado === 'entregado') seriesMap[d].entregadas++;
      else if (h.estado === 'devuelto') seriesMap[d].devueltas++;
      else if (['no_contesto', 'direccion_incorrecta', 'reagendar'].includes(h.estado)) seriesMap[d].novedades++;
    });

    return res.json(Object.values(seriesMap));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/dashboard/empresa - Portal aliado
router.get('/empresa', verificarToken, checkRole(['empresa']), async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;

    // Todas sus guías
    const { data: guias, error: gError } = await supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, estado_actual, created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (gError) throw gError;

    const total_activas = guias.filter(g => !['entregado', 'devuelto'].includes(g.estado_actual)).length;
    const total_entregadas = guias.filter(g => g.estado_actual === 'entregado').length;
    
    // Novedades en historial
    const { data: hist } = await supabase
      .from('historial_estados')
      .select('estado')
      .in('guia_id', guias.map(x=>x.id))
      .in('estado', ['no_contesto', 'direccion_incorrecta', 'reagendar']);
      
    // Count unique novelties per guia
    const guiasConNovedad = new Set((hist || []).map(h => h.guia_id));
    const total_novedades = guiasConNovedad.size;

    const base = total_entregadas + total_novedades + guias.filter(g=>g.estado_actual==='devuelto').length;
    const tasa_efectividad = base > 0 ? ((total_entregadas / base) * 100).toFixed(1) + '%' : '0.0%';

    // Recientes (ultimas 10)
    const recientes = guias.slice(0, 10);

    // Tendencia últimos 7 días
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const dsList = [];
    for(let i=0; i<7; i++){
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dsList.push({ 
            fecha: d.toLocaleDateString('en-CA'),
            registradas: 0,
            entregadas: 0
        });
    }

    // Contar Registradas ultimos 7d
    guias.forEach(g => {
        const f = g.created_at.substring(0, 10);
        const idx = dsList.findIndex(e => e.fecha === f);
        if(idx !== -1) dsList[idx].registradas++;
    });

    // Contar Entregadas ultimos 7d
    const { data: entregadasHist } = await supabase
      .from('historial_estados')
      .select('created_at')
      .eq('estado', 'entregado')
      .in('guia_id', guias.map(x=>x.id))
      .gte('created_at', startDate.toISOString());

    (entregadasHist || []).forEach(e => {
        const f = e.created_at.substring(0, 10);
        const idx = dsList.findIndex(x => x.fecha === f);
        if(idx !== -1) dsList[idx].entregadas++;
    });

    return res.json({
        kpis: {
            total_activas,
            total_entregadas,
            total_novedades,
            tasa_efectividad
        },
        recientes,
        tendencia_semanal: dsList
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
