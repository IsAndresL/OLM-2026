const express = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole } = require('../middlewares/auth');

const router = express.Router();

// GET /api/v1/dashboard/resumen - Resumen general (Admin)
router.get('/resumen', verificarToken, checkRole(['admin']), async (req, res) => {
  try {
    const today = new Date();
    // Use user-provided date or fallback to today (YYYY-MM-DD)
    const fechaParam = req.query.fecha || today.toLocaleDateString('en-CA'); 

    // Fechas límites del día
    const fechaInicio = `${fechaParam}T00:00:00`;
    const fechaFin = `${fechaParam}T23:59:59`;

    // 1. Obtener conteos básicos de todas las guías del sistema
    const { data: todasGuias, error: guiasError } = await supabase
      .from('guias')
      .select('id, empresa_id, repartidor_id, estado_actual, created_at');

    if (guiasError) throw guiasError;

    // Obtener historial del día seleccionado
    const { data: historialHoy, error: histError } = await supabase
      .from('historial_estados')
      .select('guia_id, estado, created_at')
      .gte('created_at', fechaInicio)
      .lte('created_at', fechaFin)
      .order('created_at', { ascending: false });

    if (histError) throw histError;

    // Calcular KPIs
    // - registradas hoy
    const creadasHoy = todasGuias.filter(g => g.created_at >= fechaInicio && g.created_at <= fechaFin).length;
    
    // - estado_actual
    const total_asignadas = todasGuias.filter(g => g.estado_actual === 'asignado').length;
    const total_en_ruta = todasGuias.filter(g => g.estado_actual === 'en_ruta').length;
    const sin_asignar = todasGuias.filter(g => g.estado_actual === 'registrado').length;

    // Para entregadas, devueltas y novedades en ESTE DÍA usamos el historial_estados
    // Contamos guías únicas que alcanzaron ese estado hoy
    const guiasEntregadasHoy = new Set();
    const guiasDevueltasHoy = new Set();
    const guiasNovedadesHoy = new Set();

    historialHoy.forEach(h => {
      if (h.estado === 'entregado') guiasEntregadasHoy.add(h.guia_id);
      if (h.estado === 'devuelto') guiasDevueltasHoy.add(h.guia_id);
      if (['no_contesto', 'direccion_incorrecta', 'reagendar'].includes(h.estado)) {
        guiasNovedadesHoy.add(h.guia_id);
      }
    });

    const entregadasCount = guiasEntregadasHoy.size;
    const novedadesCount = guiasNovedadesHoy.size;
    const devueltasCount = guiasDevueltasHoy.size;

    const basetTasa = entregadasCount + novedadesCount + devueltasCount;
    const tasa = basetTasa > 0 ? ((entregadasCount / basetTasa) * 100).toFixed(1) + '%' : '0.0%';

    // 2. Por Repartidor
    const { data: repartidores } = await supabase.from('usuarios').select('id, nombre_completo, activo').eq('rol', 'repartidor');
    const por_repartidor = (repartidores || []).map(rep => {
      // cuantas asignadas hoy a este rep
      const repAsignadasHoy = new Set();
      const repEntregadasHoy = new Set();
      const repNovedadesHoy = new Set();

      historialHoy.filter(h => h.usuario_id === rep.id).forEach(h => {
        if (h.estado === 'asignado' || h.estado === 'en_ruta') repAsignadasHoy.add(h.guia_id);
        if (h.estado === 'entregado') repEntregadasHoy.add(h.guia_id);
        if (['no_contesto', 'direccion_incorrecta', 'reagendar'].includes(h.estado)) repNovedadesHoy.add(h.guia_id);
      });

      const ea = repEntregadasHoy.size;
      const na = repNovedadesHoy.size;
      const t = (ea + na) > 0 ? ((ea / (ea + na)) * 100).toFixed(1) + '%' : '0.0%';

      return {
        repartidor_id: rep.id,
        nombre_completo: rep.nombre_completo,
        asignadas: repAsignadasHoy.size,
        entregadas: ea,
        novedades: na,
        tasa: t,
        activo: rep.activo
      };
    });

    // 3. Por Empresa
    const { data: empresas } = await supabase.from('empresas').select('id, nombre');
    const por_empresa = (empresas || []).map(emp => {
      // Activas = todas las guías de la empresa que no han terminado
      const activas = todasGuias.filter(g => g.empresa_id === emp.id && !['entregado', 'devuelto'].includes(g.estado_actual)).length;
      
      const entregadasHoyEmp = Array.from(guiasEntregadasHoy).filter(guiaId => {
        const g = todasGuias.find(x => x.id === guiaId);
        return g && g.empresa_id === emp.id;
      }).length;

      return {
        empresa_id: emp.id,
        nombre: emp.nombre,
        activas,
        entregadas_hoy: entregadasHoyEmp
      };
    });

    // 4. Alertas operativas (Más de 24 horas estancadas)
    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: guiasEstancadas } = await supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, updated_at, estado_actual')
      .in('estado_actual', ['asignado', 'en_ruta', 'no_contesto', 'reagendar'])
      .lt('updated_at', limite24h)
      .order('updated_at', { ascending: true })
      .limit(10);

    const alertas = (guiasEstancadas || []).map(g => {
      const msSinceUpdate = Date.now() - new Date(g.updated_at).getTime();
      const horas = Math.floor(msSinceUpdate / (1000 * 60 * 60));
      return {
        guia_id: g.id,
        numero_guia: g.numero_guia,
        nombre_destinatario: g.nombre_destinatario,
        estado_actual: g.estado_actual,
        horas_sin_movimiento: horas
      };
    });

    return res.json({
      fecha: fechaParam,
      kpis: {
        total_registradas: creadasHoy,
        total_asignadas,
        total_en_ruta,
        total_entregadas: entregadasCount,
        total_novedades: novedadesCount,
        total_devueltas: devueltasCount,
        tasa_efectividad: tasa,
        sin_asignar
      },
      por_repartidor,
      por_empresa,
      alertas
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/dashboard/tendencia - Gráfico de barras
router.get('/tendencia', verificarToken, checkRole(['admin']), async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30;
    const limitDays = Math.min(dias, 90);
    const empresaId = req.query.empresa_id;

    // Rango de fechas
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - limitDays + 1);
    startDate.setHours(0, 0, 0, 0);

    const strStart = startDate.toISOString();

    let queryGuias = supabase.from('guias').select('created_at').gte('created_at', strStart);
    let queryHist = supabase.from('historial_estados').select('estado, created_at').gte('created_at', strStart);

    if (empresaId) {
       queryGuias = queryGuias.eq('empresa_id', empresaId);
       // Join en supabase REST no tan simple para historial filtrando empresa, pero 
       // seleccionemos guiia_id y luego filtramos
       const { data: gIds } = await supabase.from('guias').select('id').eq('empresa_id', empresaId);
       const arr = gIds?.map(g => g.id) || [];
       if (arr.length > 0) {
           queryHist = queryHist.in('guia_id', arr);
       } else {
           // si no hay guias la empresa, retornar serie vacia o zeros
           queryHist = queryHist.eq('id', 'uuid-imposible'); // forzar array vacio
       }
    }

    const [resGuias, resHist] = await Promise.all([queryGuias, queryHist]);
    
    if (resGuias.error) throw resGuias.error;
    if (resHist.error) throw resHist.error;

    // Construir serie de días
    const seriesMap = {};
    for (let i = 0; i < limitDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const isoDate = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
        seriesMap[isoDate] = { fecha: isoDate, registradas: 0, entregadas: 0, novedades: 0, devueltas: 0 };
    }

    // Contar registradas (guias.created_at)
    (resGuias.data || []).forEach(g => {
        const d = g.created_at.substring(0, 10);
        if (seriesMap[d]) seriesMap[d].registradas++;
    });

    // Contar el resto (historial)
    (resHist.data || []).forEach(h => {
        const d = h.created_at.substring(0, 10);
        if (seriesMap[d]) {
            if (h.estado === 'entregado') seriesMap[d].entregadas++;
            else if (h.estado === 'devuelto') seriesMap[d].devueltas++;
            else if (['no_contesto', 'direccion_incorrecta', 'reagendar'].includes(h.estado)) seriesMap[d].novedades++;
        }
    });

    const serieTemporal = Object.values(seriesMap);
    return res.json(serieTemporal);

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
