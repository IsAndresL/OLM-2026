const express = require('express');
const PDFDocument = require('pdfkit');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();
const ESTADOS_NOVEDAD = ['no_contesto', 'direccion_incorrecta', 'reagendar'];
const ESTADOS_FLUJO = ['borrador', 'aprobada', 'pagada'];

function dayStart(fecha) {
  return `${fecha}T00:00:00`;
}

function dayEnd(fecha) {
  return `${fecha}T23:59:59`;
}

function asMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatCOP(value) {
  const monto = asMoney(value);
  return `$${monto.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDateES(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function getTarifaRepartidor(repartidorId) {
  const { data, error } = await supabase
    .from('tarifas_repartidor')
    .select('tarifa_base, tarifa_novedad')
    .eq('repartidor_id', repartidorId)
    .eq('activa', true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    tarifa_base: asMoney(data?.tarifa_base || 3500),
    tarifa_novedad: asMoney(data?.tarifa_novedad || 500),
  };
}

async function computeLiquidacion(repartidorId, fechaDesde, fechaHasta) {
  const { data: repartidor, error: repError } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, rol')
    .eq('id', repartidorId)
    .single();

  if (repError || !repartidor) throw new Error('Repartidor no encontrado');
  if (repartidor.rol !== 'repartidor') throw new Error('El usuario seleccionado no es repartidor');

  const tarifa = await getTarifaRepartidor(repartidorId);

  const { data: historialEntregadas, error: entregadasError } = await supabase
    .from('historial_estados')
    .select('guia_id, created_at, guias!inner(id, numero_guia, nombre_destinatario, repartidor_id, estado_actual, cod_cobrado)')
    .eq('estado', 'entregado')
    .eq('guias.repartidor_id', repartidorId)
    .eq('guias.estado_actual', 'entregado')
    .gte('created_at', dayStart(fechaDesde))
    .lte('created_at', dayEnd(fechaHasta));

  if (entregadasError) throw new Error(entregadasError.message);

  const entregadasMap = new Map();
  for (const row of historialEntregadas || []) {
    if (!entregadasMap.has(row.guia_id)) {
      entregadasMap.set(row.guia_id, {
        guia_id: row.guia_id,
        numero_guia: row.guias.numero_guia,
        nombre_destinatario: row.guias.nombre_destinatario,
        fecha: row.created_at,
        monto: tarifa.tarifa_base,
        tipo: 'entregada',
        cod_cobrado: asMoney(row.guias.cod_cobrado),
      });
    }
  }

  const { data: historialNovedades, error: novedadesError } = await supabase
    .from('historial_estados')
    .select('guia_id, created_at, estado, guias!inner(id, numero_guia, nombre_destinatario, repartidor_id, estado_actual)')
    .in('estado', ESTADOS_NOVEDAD)
    .eq('guias.repartidor_id', repartidorId)
    .in('guias.estado_actual', ['entregado', 'devuelto'])
    .gte('created_at', dayStart(fechaDesde))
    .lte('created_at', dayEnd(fechaHasta));

  if (novedadesError) throw new Error(novedadesError.message);

  const novedadesMap = new Map();
  for (const row of historialNovedades || []) {
    if (entregadasMap.has(row.guia_id)) continue;
    if (!novedadesMap.has(row.guia_id)) {
      novedadesMap.set(row.guia_id, {
        guia_id: row.guia_id,
        numero_guia: row.guias.numero_guia,
        nombre_destinatario: row.guias.nombre_destinatario,
        fecha: row.created_at,
        monto: tarifa.tarifa_novedad,
        tipo: 'novedad',
      });
    }
  }

  const detalleGuias = [
    ...Array.from(entregadasMap.values()),
    ...Array.from(novedadesMap.values()),
  ];

  const totalEntregadas = entregadasMap.size;
  const totalNovedades = novedadesMap.size;
  const subtotalGuias = totalEntregadas * tarifa.tarifa_base;
  const subtotalNovedades = totalNovedades * tarifa.tarifa_novedad;

  const totalCodRecaudado = Array.from(entregadasMap.values())
    .reduce((acc, row) => acc + asMoney(row.cod_cobrado), 0);

  const { data: cortesVerificados, error: cortesError } = await supabase
    .from('cortes_caja')
    .select('monto_recibido')
    .eq('repartidor_id', repartidorId)
    .eq('estado', 'verificado')
    .gte('created_at', dayStart(fechaDesde))
    .lte('created_at', dayEnd(fechaHasta));

  if (cortesError) throw new Error(cortesError.message);

  const totalCodEntregado = (cortesVerificados || []).reduce((acc, row) => acc + asMoney(row.monto_recibido), 0);
  const deduccionCod = Math.max(0, totalCodRecaudado - totalCodEntregado);
  const totalAPagar = subtotalGuias + subtotalNovedades - deduccionCod;

  return {
    repartidor,
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    tarifa,
    totales: {
      entregadas: totalEntregadas,
      novedades: totalNovedades,
      subtotal_guias: subtotalGuias,
      subtotal_novedades: subtotalNovedades,
      total_cod_recaudado: totalCodRecaudado,
      total_cod_entregado: totalCodEntregado,
      deduccion_cod: deduccionCod,
      total_a_pagar: totalAPagar,
    },
    detalle_guias: detalleGuias,
  };
}

router.get('/calcular', verificarToken, checkRole(['admin']), checkAdminPermission('liquidaciones.manage'), async (req, res) => {
  try {
    const { repartidor_id: repartidorId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = req.query;

    if (!repartidorId || !fechaDesde || !fechaHasta) {
      return res.status(400).json({ error: 'repartidor_id, fecha_desde y fecha_hasta son requeridos' });
    }

    const result = await computeLiquidacion(repartidorId, fechaDesde, fechaHasta);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/', verificarToken, checkRole(['admin']), checkAdminPermission('liquidaciones.manage'), async (req, res) => {
  try {
    const { repartidor_id: repartidorId, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, observaciones } = req.body;

    if (!repartidorId || !fechaDesde || !fechaHasta) {
      return res.status(400).json({ error: 'repartidor_id, fecha_desde y fecha_hasta son requeridos' });
    }

    const calc = await computeLiquidacion(repartidorId, fechaDesde, fechaHasta);

    const payload = {
      repartidor_id: repartidorId,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      total_entregadas: calc.totales.entregadas,
      total_novedades: calc.totales.novedades,
      tarifa_base: calc.tarifa.tarifa_base,
      tarifa_novedad: calc.tarifa.tarifa_novedad,
      subtotal_guias: calc.totales.subtotal_guias,
      subtotal_novedades: calc.totales.subtotal_novedades,
      total_cod_recaudado: calc.totales.total_cod_recaudado,
      total_cod_entregado: calc.totales.total_cod_entregado,
      deduccion_cod: calc.totales.deduccion_cod,
      total_a_pagar: calc.totales.total_a_pagar,
      estado: 'borrador',
      observaciones: observaciones || null,
      creado_por: req.user.id,
    };

    const { data: liquidacion, error: liqError } = await supabase
      .from('liquidaciones_repartidor')
      .insert(payload)
      .select('id, total_a_pagar, estado')
      .single();

    if (liqError) return res.status(500).json({ error: liqError.message });

    if (calc.detalle_guias.length > 0) {
      const rows = calc.detalle_guias.map((row) => ({
        liquidacion_id: liquidacion.id,
        guia_id: row.guia_id,
        tipo: row.tipo,
        monto: row.monto,
      }));

      const { error: detalleError } = await supabase
        .from('liquidacion_guias')
        .insert(rows);

      if (detalleError) return res.status(500).json({ error: detalleError.message });
    }

    return res.status(201).json({
      liquidacion_id: liquidacion.id,
      total_a_pagar: liquidacion.total_a_pagar,
      estado: liquidacion.estado,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/', verificarToken, checkRole(['admin']), checkAdminPermission('liquidaciones.view'), async (req, res) => {
  try {
    const { repartidor_id: repartidorId, estado, fecha_desde: fechaDesde, fecha_hasta: fechaHasta } = req.query;

    let query = supabase
      .from('liquidaciones_repartidor')
      .select('id, repartidor_id, fecha_desde, fecha_hasta, total_a_pagar, estado, created_at')
      .order('created_at', { ascending: false });

    if (repartidorId) query = query.eq('repartidor_id', repartidorId);
    if (estado) query = query.eq('estado', estado);
    if (fechaDesde) query = query.gte('created_at', dayStart(fechaDesde));
    if (fechaHasta) query = query.lte('created_at', dayEnd(fechaHasta));

    const { data: liquidaciones, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const repartidorIds = [...new Set((liquidaciones || []).map((l) => l.repartidor_id).filter(Boolean))];
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

    const result = (liquidaciones || []).map((l) => ({
      id: l.id,
      repartidor: {
        id: l.repartidor_id,
        nombre: repartidoresMap[l.repartidor_id] || 'Sin nombre',
      },
      periodo: { desde: l.fecha_desde, hasta: l.fecha_hasta },
      total_a_pagar: l.total_a_pagar,
      estado: l.estado,
      created_at: l.created_at,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id', verificarToken, checkRole(['admin']), checkAdminPermission('liquidaciones.view'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: liq, error: liqError } = await supabase
      .from('liquidaciones_repartidor')
      .select('*')
      .eq('id', id)
      .single();

    if (liqError || !liq) return res.status(404).json({ error: 'Liquidacion no encontrada' });

    const { data: repartidor, error: repError } = await supabase
      .from('usuarios')
      .select('id, nombre_completo')
      .eq('id', liq.repartidor_id)
      .single();

    if (repError) return res.status(500).json({ error: repError.message });

    const { data: detalle, error: detError } = await supabase
      .from('liquidacion_guias')
      .select('guia_id, tipo, monto, guias(numero_guia, nombre_destinatario)')
      .eq('liquidacion_id', id);

    if (detError) return res.status(500).json({ error: detError.message });

    const detalleGuias = (detalle || []).map((row) => ({
      guia_id: row.guia_id,
      numero_guia: row.guias?.numero_guia || '—',
      nombre_destinatario: row.guias?.nombre_destinatario || '—',
      tipo: row.tipo,
      monto: row.monto,
    }));

    return res.json({
      ...liq,
      repartidor,
      detalle_guias: detalleGuias,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/estado', verificarToken, checkRole(['admin']), checkAdminPermission('liquidaciones.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, observaciones } = req.body;

    if (!ESTADOS_FLUJO.includes(estado) || estado === 'borrador') {
      return res.status(400).json({ error: 'Estado no valido. Solo se permite aprobar o marcar pagada' });
    }

    const { data: liq, error: liqError } = await supabase
      .from('liquidaciones_repartidor')
      .select('id, estado')
      .eq('id', id)
      .single();

    if (liqError || !liq) return res.status(404).json({ error: 'Liquidacion no encontrada' });

    const currentIndex = ESTADOS_FLUJO.indexOf(liq.estado);
    const nextIndex = ESTADOS_FLUJO.indexOf(estado);

    if (nextIndex <= currentIndex) {
      return res.status(409).json({ error: 'Solo se permite avanzar de estado (borrador -> aprobada -> pagada)' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('liquidaciones_repartidor')
      .update({ estado, observaciones: observaciones || null })
      .eq('id', id)
      .select('id, estado, observaciones')
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/pdf', verificarToken, checkRole(['admin']), checkAdminPermission('liquidaciones.view'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: liq, error: liqError } = await supabase
      .from('liquidaciones_repartidor')
      .select('*')
      .eq('id', id)
      .single();

    if (liqError || !liq) return res.status(404).json({ error: 'Liquidacion no encontrada' });

    const { data: repartidor, error: repError } = await supabase
      .from('usuarios')
      .select('nombre_completo')
      .eq('id', liq.repartidor_id)
      .single();

    if (repError) return res.status(500).json({ error: repError.message });

    const { data: detalle, error: detError } = await supabase
      .from('liquidacion_guias')
      .select('monto, tipo, guias(numero_guia, nombre_destinatario)')
      .eq('liquidacion_id', id)
      .order('guia_id', { ascending: true });

    if (detError) return res.status(500).json({ error: detError.message });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const filename = `liquidacion-${id.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('OPERACIONES LOGISTICAS DEL MAGDALENA', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).font('Helvetica').text('NIT: 900000001-1', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(14).font('Helvetica-Bold').text('LIQUIDACION DE SERVICIOS', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`No. ${id.slice(0, 8).toUpperCase()}`, { align: 'center' });
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(11);
    doc.text(`Repartidor: ${repartidor?.nombre_completo || '—'}`);
    doc.text(`Periodo: ${formatDateES(liq.fecha_desde)} al ${formatDateES(liq.fecha_hasta)}`);
    doc.text(`Fecha emision: ${formatDateES(new Date().toISOString())}`);
    doc.text(`Estado: ${String(liq.estado || '').toUpperCase()}`);
    doc.moveDown(0.8);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#BBBBBB').stroke();
    doc.moveDown(0.8);

    doc.text(`Guias entregadas: ${liq.total_entregadas} x ${formatCOP(liq.tarifa_base)}`);
    doc.text(`Subtotal entregas: ${formatCOP(liq.subtotal_guias)}`);
    doc.text(`Novedades gestionadas: ${liq.total_novedades} x ${formatCOP(liq.tarifa_novedad)}`);
    doc.text(`Subtotal novedades: ${formatCOP(liq.subtotal_novedades)}`);
    doc.moveDown(0.5);
    doc.text(`Total COD recaudado: ${formatCOP(liq.total_cod_recaudado)}`);
    doc.text(`Total COD entregado a sede: ${formatCOP(liq.total_cod_entregado)}`);
    doc.text(`Diferencia COD: ${formatCOP(liq.deduccion_cod)}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text(`TOTAL A PAGAR: ${formatCOP(liq.total_a_pagar)}`);
    doc.font('Helvetica');
    doc.moveDown(0.8);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#BBBBBB').stroke();
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').text('Detalle de guias incluidas');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9);

    for (const row of detalle || []) {
      const numero = row.guias?.numero_guia || '—';
      const destinatario = row.guias?.nombre_destinatario || '—';
      const tipo = row.tipo === 'novedad' ? 'NOVEDAD' : 'ENTREGA';
      const monto = formatCOP(row.monto);
      doc.text(`${numero}  |  ${destinatario}  |  ${tipo}  |  ${monto}`);
    }

    doc.moveDown(2);
    doc.text('_____________________');
    doc.text('Firma del repartidor');

    doc.end();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
