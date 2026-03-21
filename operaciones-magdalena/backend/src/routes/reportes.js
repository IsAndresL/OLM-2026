const express = require('express');
const XLSX = require('xlsx-js-style');
const PDFDocument = require('pdfkit');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();

function sanitizeSearchTerm(value = '') {
  return String(value)
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function signStoragePath(bucket, path, expiresIn = 604800) {
  if (!path) return '';
  if (String(path).startsWith('http')) return path;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return path;
  return data.signedUrl;
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-CO');
}

function formatCOP(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '$0';
  return `$${n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function fetchImageBuffer(url) {
  try {
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  } catch (_err) {
    return null;
  }
}

function generarExcel(guias) {
  const wb = XLSX.utils.book_new();

  // Encabezados
  const headers = ['Número guía','Fecha registro','Remitente','Destinatario',
    'Teléfono','Dirección','Ciudad','Barrio','Peso kg','Valor declarado',
    'Estado','Empresa','Repartidor','Fecha último estado','Observaciones'];

  const headerStyle = {
    fill: { fgColor: { rgb: '1D4ED8' } },
    font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      bottom: { style: 'thin', color: { rgb: 'FFFFFF' } }
    }
  };

  // Construir filas
  const rows = [
    headers.map(h => ({ v: h, s: headerStyle })),
    ...guias.map((g, i) => {
      const shade = i % 2 === 0;
      const cellStyle = shade
        ? { fill: { fgColor: { rgb: 'F9FAFB' } }, font: { sz: 10 } }
        : { font: { sz: 10 } };
      
      const vDec = g.valor_declarado ? parseFloat(g.valor_declarado).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }) : '';

      return [
        g.numero_guia, g.created_at?.substring(0, 10),
        g.nombre_remitente, g.nombre_destinatario,
        g.telefono_destinatario, g.direccion_destinatario,
        g.ciudad_destino, g.barrio || '',
        g.peso_kg || '', vDec,
        g.estado_actual,
        g.empresa?.nombre || '', g.repartidor?.nombre_completo || '',
        g.ultimo_cambio?.substring(0, 16)?.replace('T',' ') || '',
        g.observaciones || ''
      ].map(v => ({ v: v ?? '', s: cellStyle }));
    })
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ancho de columnas automático
  ws['!cols'] = [12, 14, 20, 20, 15, 25, 15, 15, 10, 15, 15, 20, 20, 20, 30].map(w => ({ wch: w }));

  // Congelar primera fila
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, 'Guías');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// GET /api/v1/reportes/exportar
router.get('/exportar', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('reportes.export'), async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, repartidor_id, estado } = req.query;
    
    // Determinar empresa_id según rol o query param
    let empresa_id = req.user.rol === 'empresa' ? req.user.empresa_id : req.query.empresa_id;

    // Query a Supabase
    let query = supabase
      .from('guias')
      .select(`
        *,
        empresa:empresas(id, nombre),
        repartidor:usuarios!repartidor_id(id, nombre_completo),
        historial_estados!left(created_at, estado, nota)
      `)
      .order('created_at', { ascending: false })
      .limit(5000); // Límite generoso sin paginación

    if (empresa_id) query = query.eq('empresa_id', empresa_id);
    if (repartidor_id) query = query.eq('repartidor_id', repartidor_id);
    if (estado) query = query.eq('estado_actual', estado);
    if (fecha_desde) query = query.gte('created_at', fecha_desde + 'T00:00:00');
    if (fecha_hasta) query = query.lte('created_at', fecha_hasta + 'T23:59:59');

    const { data: guias, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Preparar el array para el excel
    const guiasPreparadas = guias.map(g => {
        // Find latest hist date
        let ult = null;
        if (g.historial_estados && g.historial_estados.length > 0) {
            const arr = g.historial_estados.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            ult = arr[0]?.created_at;
        }

        return {
            ...g,
            ultimo_cambio: ult || g.updated_at
        };
    });

    const buffer = generarExcel(guiasPreparadas);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-magdalena-${new Date().toISOString().substring(0,10)}.xlsx"`
    });
    
    return res.end(buffer);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/reportes/exportar-detallado
router.get('/exportar-detallado', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('reportes.export'), async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, repartidor_id, estado, q } = req.query;
    const empresa_id = req.user.rol === 'empresa' ? req.user.empresa_id : req.query.empresa_id;

    let query = supabase
      .from('guias')
      .select(`
        id, numero_guia, created_at, updated_at, estado_actual,
        nombre_remitente, nombre_destinatario, telefono_destinatario,
        direccion_destinatario, ciudad_destino, barrio,
        descripcion_paquete, peso_kg, valor_declarado, observaciones,
        repartidor_id, empresa_id,
        es_cod, monto_cod, cod_cobrado, cod_metodo, cod_estado,
        empresa:empresas(id, nombre),
        repartidor:usuarios!repartidor_id(id, nombre_completo),
        historial_estados(id, estado, nota, created_at, foto_evidencia_url, firma_url, nombre_receptor, cedula_receptor)
      `)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (empresa_id) query = query.eq('empresa_id', empresa_id);
    if (repartidor_id) query = query.eq('repartidor_id', repartidor_id);
    if (estado) query = query.eq('estado_actual', estado);
    if (fecha_desde) query = query.gte('created_at', `${fecha_desde}T00:00:00`);
    if (fecha_hasta) query = query.lte('created_at', `${fecha_hasta}T23:59:59`);
    if (q) {
      const safeQ = sanitizeSearchTerm(q);
      if (safeQ) {
        query = query.or(`numero_guia.ilike.%${safeQ}%,nombre_destinatario.ilike.%${safeQ}%,telefono_destinatario.ilike.%${safeQ}%`);
      }
    }

    const { data: guias, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const guiaIds = [...new Set((guias || []).map((g) => g.id).filter(Boolean))];
    let liquidacionMapByGuia = {};

    if (guiaIds.length > 0) {
      const { data: liqRows, error: liqRowsError } = await supabase
        .from('liquidacion_guias')
        .select('guia_id, liquidacion_id, monto, tipo')
        .in('guia_id', guiaIds);

      if (liqRowsError) return res.status(500).json({ error: liqRowsError.message });

      const liquidacionIds = [...new Set((liqRows || []).map((r) => r.liquidacion_id).filter(Boolean))];
      let liquidacionesMap = {};

      if (liquidacionIds.length > 0) {
        const { data: liquidaciones, error: liquidacionesError } = await supabase
          .from('liquidaciones_repartidor')
          .select('id, fecha_desde, fecha_hasta, total_a_pagar, estado, created_at')
          .in('id', liquidacionIds);

        if (liquidacionesError) return res.status(500).json({ error: liquidacionesError.message });
        liquidacionesMap = (liquidaciones || []).reduce((acc, row) => {
          acc[row.id] = row;
          return acc;
        }, {});
      }

      for (const row of (liqRows || [])) {
        const liq = liquidacionesMap[row.liquidacion_id];
        if (!liq) continue;
        const current = liquidacionMapByGuia[row.guia_id];
        const incomingDate = new Date(liq.created_at || 0).getTime();
        const currentDate = current ? new Date(current.created_at || 0).getTime() : -1;
        if (!current || incomingDate > currentDate) {
          liquidacionMapByGuia[row.guia_id] = {
            liquidacion_id: row.liquidacion_id,
            monto_guia: Number(row.monto || 0),
            tipo: row.tipo,
            estado: liq.estado,
            fecha_desde: liq.fecha_desde,
            fecha_hasta: liq.fecha_hasta,
            total_a_pagar: Number(liq.total_a_pagar || 0),
            created_at: liq.created_at,
          };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    const headerStyle = {
      fill: { fgColor: { rgb: '1D4ED8' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: 'FFFFFF' } } },
    };

    const guiaHeaders = [
      'Guia', 'Fecha registro', 'Estado actual', 'Empresa', 'Repartidor',
      'Destinatario', 'Telefono', 'Direccion', 'Ciudad', 'Barrio',
      'Descripcion paquete', 'Peso kg', 'Valor declarado', 'Observaciones guia',
      'Es COD', 'Monto COD', 'Monto COD cobrado', 'Metodo COD', 'Estado COD',
      'Fecha entrega', 'Nota entrega', 'Receptor', 'Documento receptor',
      'Foto evidencia URL', 'Firma URL',
      'Liquidacion ID', 'Estado liquidacion', 'Periodo liquidacion',
      'Monto liquidado guia', 'Total liquidacion repartidor',
      'Pago al repartidor registrado', 'Fecha liquidacion'
    ];

    const historialHeaders = [
      'Guia', 'Empresa', 'Repartidor', 'Estado evento', 'Fecha evento',
      'Nota', 'Receptor', 'Documento receptor', 'Foto evidencia URL', 'Firma URL'
    ];

    const historialRows = [];
    const guiaRows = [];

    for (const g of (guias || [])) {
      const historialSorted = (g.historial_estados || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const eventoEntrega = historialSorted.find((h) => h.estado === 'entregado') || null;

      const fotoEntregaUrl = await signStoragePath('evidencias', eventoEntrega?.foto_evidencia_url);
      const firmaEntregaUrl = await signStoragePath('firmas', eventoEntrega?.firma_url);

      const liq = liquidacionMapByGuia[g.id] || null;
      const periodoLiquidacion = liq ? `${liq.fecha_desde || ''} a ${liq.fecha_hasta || ''}` : '';

      guiaRows.push([
        g.numero_guia || '',
        formatDateTime(g.created_at),
        g.estado_actual || '',
        g.empresa?.nombre || '',
        g.repartidor?.nombre_completo || '',
        g.nombre_destinatario || '',
        g.telefono_destinatario || '',
        g.direccion_destinatario || '',
        g.ciudad_destino || '',
        g.barrio || '',
        g.descripcion_paquete || '',
        g.peso_kg || '',
        g.valor_declarado || '',
        g.observaciones || '',
        g.es_cod ? 'SI' : 'NO',
        g.monto_cod || 0,
        g.cod_cobrado || 0,
        g.cod_metodo || '',
        g.cod_estado || '',
        formatDateTime(eventoEntrega?.created_at),
        eventoEntrega?.nota || '',
        eventoEntrega?.nombre_receptor || '',
        eventoEntrega?.cedula_receptor || '',
        fotoEntregaUrl || '',
        firmaEntregaUrl || '',
        liq?.liquidacion_id || '',
        liq?.estado || '',
        periodoLiquidacion,
        liq?.monto_guia || '',
        liq?.total_a_pagar || '',
        liq ? (liq.estado === 'pagada' ? 'SI' : 'NO') : '',
        formatDateTime(liq?.created_at),
      ]);

      for (const h of historialSorted) {
        const fotoUrl = await signStoragePath('evidencias', h.foto_evidencia_url);
        const firmaUrl = await signStoragePath('firmas', h.firma_url);
        historialRows.push([
          g.numero_guia || '',
          g.empresa?.nombre || '',
          g.repartidor?.nombre_completo || '',
          h.estado || '',
          formatDateTime(h.created_at),
          h.nota || '',
          h.nombre_receptor || '',
          h.cedula_receptor || '',
          fotoUrl || '',
          firmaUrl || '',
        ]);
      }
    }

    const wsGuias = XLSX.utils.aoa_to_sheet([
      guiaHeaders.map((h) => ({ v: h, s: headerStyle })),
      ...guiaRows,
    ]);
    wsGuias['!cols'] = [14, 20, 14, 22, 24, 24, 14, 28, 14, 16, 22, 10, 14, 24, 10, 12, 16, 14, 14, 20, 24, 18, 18, 45, 45, 38, 16, 22, 16, 22, 18, 20].map((w) => ({ wch: w }));
    wsGuias['!freeze'] = { xSplit: 0, ySplit: 1 };

    const wsHistorial = XLSX.utils.aoa_to_sheet([
      historialHeaders.map((h) => ({ v: h, s: headerStyle })),
      ...historialRows,
    ]);
    wsHistorial['!cols'] = [14, 22, 24, 16, 20, 28, 18, 18, 45, 45].map((w) => ({ wch: w }));
    wsHistorial['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, wsGuias, 'Guias_Detalle');
    XLSX.utils.book_append_sheet(wb, wsHistorial, 'Historial_Estados');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-detallado-guias-${new Date().toISOString().substring(0,10)}.xlsx"`,
    });

    return res.end(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/reportes/guia/:id/pdf-detallado
router.get('/guia/:id/pdf-detallado', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('reportes.export'), async (req, res) => {
  try {
    const { id } = req.params;

    let guiaQuery = supabase
      .from('guias')
      .select(`
        id, numero_guia, created_at, updated_at, estado_actual,
        nombre_remitente, nombre_destinatario, telefono_destinatario,
        direccion_destinatario, ciudad_destino, barrio,
        descripcion_paquete, peso_kg, valor_declarado, observaciones,
        repartidor_id, empresa_id,
        es_cod, monto_cod, cod_cobrado, cod_metodo, cod_estado,
        empresa:empresas(id, nombre),
        repartidor:usuarios!repartidor_id(id, nombre_completo),
        historial_estados(id, estado, nota, created_at, foto_evidencia_url, firma_url, nombre_receptor, cedula_receptor)
      `)
      .eq('id', id)
      .single();

    if (req.user.rol === 'empresa') {
      guiaQuery = guiaQuery.eq('empresa_id', req.user.empresa_id);
    }

    const { data: guia, error: guiaError } = await guiaQuery;
    if (guiaError || !guia) return res.status(404).json({ error: 'Guia no encontrada' });

    const historial = (guia.historial_estados || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const eventoEntrega = historial.find((h) => h.estado === 'entregado') || null;

    const fotoEntregaUrl = await signStoragePath('evidencias', eventoEntrega?.foto_evidencia_url);
    const firmaEntregaUrl = await signStoragePath('firmas', eventoEntrega?.firma_url);

    const { data: liqRows, error: liqRowsError } = await supabase
      .from('liquidacion_guias')
      .select('guia_id, liquidacion_id, monto, tipo')
      .eq('guia_id', guia.id);

    if (liqRowsError) return res.status(500).json({ error: liqRowsError.message });

    let liquidacionInfo = null;
    if ((liqRows || []).length > 0) {
      const liquidacionIds = [...new Set(liqRows.map((r) => r.liquidacion_id).filter(Boolean))];
      if (liquidacionIds.length > 0) {
        const { data: liquidaciones, error: liqError } = await supabase
          .from('liquidaciones_repartidor')
          .select('id, fecha_desde, fecha_hasta, total_a_pagar, estado, created_at')
          .in('id', liquidacionIds);

        if (liqError) return res.status(500).json({ error: liqError.message });

        const latest = (liquidaciones || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (latest) {
          const row = (liqRows || []).find((r) => r.liquidacion_id === latest.id);
          liquidacionInfo = {
            liquidacion_id: latest.id,
            fecha_desde: latest.fecha_desde,
            fecha_hasta: latest.fecha_hasta,
            total_a_pagar: Number(latest.total_a_pagar || 0),
            estado: latest.estado,
            created_at: latest.created_at,
            monto_guia: Number(row?.monto || 0),
            tipo: row?.tipo || '',
          };
        }
      }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const filename = `guia-detalle-${String(guia.numero_guia || guia.id).replace(/\s+/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text(`Detalle de guia ${guia.numero_guia || ''}`);
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`Generado: ${formatDateTime(new Date().toISOString())}`);
    doc.moveDown(0.8);

    const line = (label, value) => {
      doc.font('Helvetica-Bold').fillColor('#111827').text(`${label}: `, { continued: true });
      doc.font('Helvetica').fillColor('#374151').text(value || '—');
    };

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Datos generales');
    doc.moveDown(0.3);
    line('Estado actual', guia.estado_actual);
    line('Empresa', guia.empresa?.nombre || '—');
    line('Repartidor', guia.repartidor?.nombre_completo || 'Sin asignar');
    line('Fecha registro', formatDateTime(guia.created_at));
    line('Remitente', guia.nombre_remitente);
    line('Destinatario', guia.nombre_destinatario);
    line('Telefono', guia.telefono_destinatario);
    line('Direccion', [guia.direccion_destinatario, guia.barrio, guia.ciudad_destino].filter(Boolean).join(' - '));
    line('Paquete', guia.descripcion_paquete || '—');
    line('Peso', guia.peso_kg ? `${guia.peso_kg} kg` : '—');
    line('Valor declarado', guia.valor_declarado ? formatCOP(guia.valor_declarado) : '—');
    line('Observaciones', guia.observaciones || '—');
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Contraentrega (COD)');
    doc.moveDown(0.3);
    if (!guia.es_cod) {
      line('COD', 'No aplica');
    } else {
      line('Monto a cobrar', formatCOP(guia.monto_cod));
      line('Monto cobrado', formatCOP(guia.cod_cobrado));
      line('Metodo cobro', guia.cod_metodo || '—');
      line('Estado COD', guia.cod_estado || '—');
    }
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Datos de entrega');
    doc.moveDown(0.3);
    line('Fecha entrega', formatDateTime(eventoEntrega?.created_at));
    line('Novedad', eventoEntrega?.nota || '—');
    line('Receptor', eventoEntrega?.nombre_receptor || '—');
    line('Documento receptor', eventoEntrega?.cedula_receptor || '—');
    line('Foto evidencia URL', fotoEntregaUrl || '—');
    line('Firma URL', firmaEntregaUrl || '—');
    doc.moveDown(0.8);

    const fotoBuffer = await fetchImageBuffer(fotoEntregaUrl);
    const firmaBuffer = await fetchImageBuffer(firmaEntregaUrl);

    const startY = doc.y;
    const cardW = 250;
    const cardH = 140;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Foto evidencia', 36, startY);
    doc.rect(36, startY + 14, cardW, cardH).strokeColor('#d1d5db').stroke();
    if (fotoBuffer) {
      try {
        doc.image(fotoBuffer, 40, startY + 18, { fit: [cardW - 8, cardH - 8], align: 'center', valign: 'center' });
      } catch (_e) {
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('No se pudo incrustar la imagen.', 44, startY + 24);
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Sin imagen disponible.', 44, startY + 24);
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Firma', 312, startY);
    doc.rect(312, startY + 14, cardW, cardH).strokeColor('#d1d5db').stroke();
    if (firmaBuffer) {
      try {
        doc.image(firmaBuffer, 316, startY + 18, { fit: [cardW - 8, cardH - 8], align: 'center', valign: 'center' });
      } catch (_e) {
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('No se pudo incrustar la firma.', 320, startY + 24);
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Sin firma disponible.', 320, startY + 24);
    }

    doc.y = startY + cardH + 28;
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Liquidacion del repartidor');
    doc.moveDown(0.3);
    if (!liquidacionInfo) {
      line('Liquidacion', 'No existe liquidacion asociada para esta guia');
    } else {
      line('Liquidacion ID', liquidacionInfo.liquidacion_id);
      line('Estado', liquidacionInfo.estado || '—');
      line('Periodo', `${liquidacionInfo.fecha_desde || '—'} a ${liquidacionInfo.fecha_hasta || '—'}`);
      line('Monto liquidado por esta guia', formatCOP(liquidacionInfo.monto_guia));
      line('Total liquidacion repartidor', formatCOP(liquidacionInfo.total_a_pagar));
      line('Pago registrado', liquidacionInfo.estado === 'pagada' ? 'SI' : 'NO');
      line('Fecha liquidacion', formatDateTime(liquidacionInfo.created_at));
    }

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('Historial de estados');
    doc.moveDown(0.5);

    if (historial.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('No hay eventos de historial para esta guia.');
    } else {
      for (const h of historial) {
        if (doc.y > 740) doc.addPage();
        const fotoUrl = await signStoragePath('evidencias', h.foto_evidencia_url);
        const firmaUrl = await signStoragePath('firmas', h.firma_url);

        doc.roundedRect(36, doc.y, 523, 90, 8).strokeColor('#e5e7eb').stroke();
        const y0 = doc.y + 8;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(`Estado: ${h.estado || '—'}`, 46, y0);
        doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`Fecha: ${formatDateTime(h.created_at)}`, 46, y0 + 14);
        doc.text(`Nota: ${h.nota || '—'}`, 46, y0 + 28, { width: 500 });
        doc.text(`Receptor: ${h.nombre_receptor || '—'} | Doc: ${h.cedula_receptor || '—'}`, 46, y0 + 44, { width: 500 });
        doc.text(`Foto: ${fotoUrl || '—'}`, 46, y0 + 58, { width: 500 });
        doc.text(`Firma: ${firmaUrl || '—'}`, 46, y0 + 72, { width: 500 });
        doc.y += 102;
      }
    }

    doc.end();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
