const express = require('express');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();

const PAGE_W = 283;
const PAGE_H = 425;
const OUTER_MARGIN = 7;
const LABEL_X = OUTER_MARGIN;
const LABEL_Y = OUTER_MARGIN;
const LABEL_W = PAGE_W - (OUTER_MARGIN * 2);
const LABEL_H = PAGE_H - (OUTER_MARGIN * 2);
const CONTENT_PADDING = 10;
const CONTENT_X = LABEL_X + CONTENT_PADDING;
const CONTENT_W = LABEL_W - (CONTENT_PADDING * 2);
const MM = 72 / 25.4;

function mm(value) {
  return value * MM;
}

function formatCOP(monto) {
  if (!monto) return '$0';
  return '$' + Number(monto).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatFechaCorta(fechaStr) {
  if (!fechaStr) return 'Por confirmar';
  const d = new Date(fechaStr);
  if (Number.isNaN(d.getTime())) return 'Por confirmar';
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function formatFechaRegistro(fechaStr) {
  if (!fechaStr) return '--/--/----';
  const d = new Date(fechaStr);
  if (Number.isNaN(d.getTime())) return '--/--/----';
  const dd = String(d.getDate()).padStart(2, '0');
  const mmv = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mmv}/${yyyy}`;
}

function safeText(value, fallback = '--') {
  const txt = String(value ?? '').trim();
  return txt || fallback;
}

function shrinkText(value = '', maxLength = 30) {
  const txt = safeText(value, 'Sin descripcion');
  if (txt.length <= maxLength) return txt;
  return `${txt.slice(0, maxLength - 1)}...`;
}

function spacedGuide(guideNumber = '') {
  return String(guideNumber || '')
    .split('')
    .join(' ');
}

function drawRoundedChip(doc, x, y, w, h, radius, fillColor) {
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fill(fillColor);
  doc.restore();
}

function drawHeaderLogo(doc, x, y) {
  const boxSize = 24;
  doc.save();
  doc.roundedRect(x, y, boxSize, boxSize, 4).fillOpacity(0.2).fill('#FFFFFF');
  doc.fillOpacity(1);

  const truckX = x + 5;
  const truckY = y + 8;
  doc.rect(truckX, truckY, 10, 6).fill('#FFFFFF');
  doc.rect(truckX + 10, truckY + 1, 4, 5).fill('#FFFFFF');
  doc.circle(truckX + 3, truckY + 8, 1.5).fill('#FFFFFF');
  doc.circle(truckX + 11, truckY + 8, 1.5).fill('#FFFFFF');
  doc.restore();
}

function drawOuterFrame(doc) {
  doc.save();
  doc.roundedRect(LABEL_X, LABEL_Y, LABEL_W, LABEL_H, mm(3)).lineWidth(0.5).stroke('#E5E7EB');
  doc.restore();
}

async function generateAssetsForGuia(guia) {
  const trackingBase = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const trackingUrl = trackingBase
    ? `${trackingBase}/rastrear/${guia.numero_guia}`
    : guia.numero_guia;

  const qrBuffer = await QRCode.toBuffer(trackingUrl, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: guia.numero_guia,
    scale: 2,
    height: 12,
    includetext: false,
  });

  return { qrBuffer, barcodeBuffer };
}

async function generarEtiquetaPagina(doc, guia, isFirst = false) {
  if (!isFirst) {
    doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
  }

  const { qrBuffer, barcodeBuffer } = await generateAssetsForGuia(guia);

  const headerH = mm(18);
  const qrSize = mm(22);
  const gap = 8;
  const contentTop = LABEL_Y + CONTENT_PADDING;

  drawOuterFrame(doc);

  // 1) Header
  doc.save();
  doc.roundedRect(CONTENT_X, contentTop, CONTENT_W, headerH, 5).fill('#1D4ED8');
  doc.restore();

  const logoX = CONTENT_X + 8;
  const logoY = contentTop + 8;
  drawHeaderLogo(doc, logoX, logoY);

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
    .text('OLM', logoX + 30, logoY + 2, { width: 85 });
  doc.font('Helvetica').fontSize(5.5).fillColor('#93C5FD')
    .text('Operaciones Logisticas del Magdalena', logoX + 30, logoY + 12, { width: 105 });

  const rightHeaderX = CONTENT_X + CONTENT_W - 112;
  doc.font('Helvetica-Bold').fontSize(5).fillColor('#93C5FD')
    .text('NUMERO DE GUIA', rightHeaderX, logoY + 2, { width: 104, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
    .text(safeText(guia.numero_guia, 'SIN-GUIA'), rightHeaderX, logoY + 11, { width: 104, align: 'right' });

  // 2) Destinatario + QR
  let y = contentTop + headerH + mm(3);
  const textAreaW = CONTENT_W - qrSize - 12;

  doc.font('Helvetica-Bold').fontSize(5).fillColor('#9CA3AF')
    .text('DESTINATARIO', CONTENT_X, y, { width: textAreaW });
  y += 8;

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827')
    .text(safeText(guia.nombre_destinatario, 'Destinatario sin nombre'), CONTENT_X, y, {
      width: textAreaW,
      lineBreak: false,
      ellipsis: true,
    });
  y += 14;

  doc.font('Helvetica').fontSize(7).fillColor('#374151')
    .text(safeText(guia.direccion_destinatario, 'Direccion por confirmar'), CONTENT_X, y, {
      width: textAreaW,
      lineBreak: false,
      ellipsis: true,
    });
  y += 9;

  if (guia.barrio) {
    doc.text(`Barrio ${safeText(guia.barrio)}`, CONTENT_X, y, {
      width: textAreaW,
      lineBreak: false,
      ellipsis: true,
    });
    y += 9;
  }

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111827')
    .text(`${safeText(guia.ciudad_destino, 'Ciudad')}, Magdalena`, CONTENT_X, y, {
      width: textAreaW,
      lineBreak: false,
      ellipsis: true,
    });
  y += 10;

  const telChipY = y;
  drawRoundedChip(doc, CONTENT_X, telChipY, Math.min(textAreaW, 95), 14, 4, '#E6F1FB');
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#1D4ED8')
    .text(safeText(guia.telefono_destinatario, 'Sin telefono'), CONTENT_X + 8, telChipY + 4, {
      width: Math.min(textAreaW, 95) - 12,
      lineBreak: false,
      ellipsis: true,
    });

  const qrX = CONTENT_X + CONTENT_W - qrSize;
  const qrY = contentTop + headerH + 8;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  doc.font('Helvetica').fontSize(5).fillColor('#9CA3AF')
    .text('rastrear envio', qrX, qrY + qrSize + 3, { width: qrSize, align: 'center' });

  // 3) Chips de info
  const chipsY = contentTop + headerH + 102;
  const chipH = mm(9);
  const chipGap = 6;
  const chipW = (CONTENT_W - (chipGap * 2)) / 3;
  const fechaEntrega = formatFechaCorta(guia.fecha_estimada_entrega);
  const peso = guia.peso_kg ? `${Number(guia.peso_kg)} kg` : 'Sin dato';

  const chips = [
    { label: 'DESCRIPCION', value: shrinkText(guia.descripcion_paquete || 'Sin descripcion', 18) },
    { label: 'PESO', value: peso },
    { label: 'ENTREGA EST.', value: fechaEntrega },
  ];

  chips.forEach((chip, index) => {
    const chipX = CONTENT_X + ((chipW + chipGap) * index);
    drawRoundedChip(doc, chipX, chipsY, chipW, chipH, 4, '#F9FAFB');
    doc.font('Helvetica-Bold').fontSize(4.5).fillColor('#9CA3AF')
      .text(chip.label, chipX + 6, chipsY + 3, { width: chipW - 12, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#111827')
      .text(chip.value, chipX + 6, chipsY + 10, {
        width: chipW - 12,
        lineBreak: false,
        ellipsis: true,
      });
  });

  // 4) COD badge condicional
  let sectionY = chipsY + chipH + 8;
  if (guia.es_cod === true) {
    const codH = 28;
    doc.save();
    doc.roundedRect(CONTENT_X, sectionY, CONTENT_W, codH, mm(2)).lineWidth(0.3).fillAndStroke('#FFF7ED', '#FED7AA');
    doc.restore();

    doc.save();
    doc.circle(CONTENT_X + 10, sectionY + 10, mm(1.8)).fill('#F97316');
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(5).fillColor('#9A3412')
      .text('COBRO CONTRA ENTREGA (COD)', CONTENT_X + 18, sectionY + 5, { width: CONTENT_W - 24 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#C2410C')
      .text(formatCOP(guia.monto_cod), CONTENT_X + 18, sectionY + 14, { width: CONTENT_W - 24 });

    sectionY += codH + 8;
  }

  // 5) Remitente
  const remitH = 26;
  drawRoundedChip(doc, CONTENT_X, sectionY, CONTENT_W, remitH, 4, '#F9FAFB');
  doc.font('Helvetica-Bold').fontSize(4.5).fillColor('#9CA3AF')
    .text('DE', CONTENT_X + 8, sectionY + 5, { width: 10 });
  doc.save();
  doc.moveTo(CONTENT_X + 22, sectionY + 4).lineTo(CONTENT_X + 22, sectionY + remitH - 4).lineWidth(0.6).stroke('#D1D5DB');
  doc.restore();

  const empresaNombre = safeText(guia?.empresas?.nombre || guia.nombre_remitente, 'Remitente');
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#111827')
    .text(empresaNombre, CONTENT_X + 28, sectionY + 5, {
      width: CONTENT_W - 34,
      lineBreak: false,
      ellipsis: true,
    });
  doc.font('Helvetica').fontSize(6).fillColor('#6B7280')
    .text(safeText(guia.nombre_remitente, 'Sin remitente'), CONTENT_X + 28, sectionY + 14, {
      width: CONTENT_W - 34,
      lineBreak: false,
      ellipsis: true,
    });

  sectionY += remitH + 8;

  // 6) Barcode
  doc.save();
  doc.moveTo(CONTENT_X, sectionY).lineTo(CONTENT_X + CONTENT_W, sectionY).lineWidth(0.6).stroke('#E5E7EB');
  doc.restore();

  const barcodeY = sectionY + 8;
  doc.image(barcodeBuffer, CONTENT_X, barcodeY, { fit: [CONTENT_W, 48], align: 'center' });
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#374151')
    .text(spacedGuide(safeText(guia.numero_guia, 'SIN-GUIA')), CONTENT_X, barcodeY + 50, {
      width: CONTENT_W,
      align: 'center',
    });

  // 7) Footer 3 columnas
  const footerH = mm(10);
  const footerY = LABEL_Y + LABEL_H - CONTENT_PADDING - footerH;
  drawRoundedChip(doc, CONTENT_X, footerY, CONTENT_W, footerH, 3, '#F9FAFB');

  const colW = CONTENT_W / 3;
  doc.save();
  doc.moveTo(CONTENT_X + colW, footerY + 3).lineTo(CONTENT_X + colW, footerY + footerH - 3).lineWidth(0.5).stroke('#E5E7EB');
  doc.moveTo(CONTENT_X + (colW * 2), footerY + 3).lineTo(CONTENT_X + (colW * 2), footerY + footerH - 3).lineWidth(0.5).stroke('#E5E7EB');
  doc.restore();

  const footerCols = [
    { label: 'CIUDAD DESTINO', value: safeText(guia.ciudad_destino, '--') },
    { label: 'BARRIO', value: safeText(guia.barrio, '—') },
    { label: 'FECHA REGISTRO', value: formatFechaRegistro(guia.created_at) },
  ];

  footerCols.forEach((col, idx) => {
    const colX = CONTENT_X + (colW * idx);
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#111827')
      .text(col.value, colX + 2, footerY + 3, {
        width: colW - 4,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });
    doc.font('Helvetica').fontSize(4.5).fillColor('#9CA3AF')
      .text(col.label, colX + 2, footerY + 12, {
        width: colW - 4,
        align: 'center',
      });
  });
}

// GET /api/v1/etiquetas/:guia_id
router.get('/:guia_id', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('etiquetas.generar'), async (req, res) => {
  try {
    const { data: guia, error } = await supabase
      .from('guias')
      .select('*, empresas(nombre)')
      .eq('id', req.params.guia_id)
      .single();

    if (error || !guia) return res.status(404).json({ error: 'Guia no encontrada' });

    if (req.user.rol === 'empresa' && guia.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Sin acceso a esta guia' });
    }

    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${guia.numero_guia}.pdf"`);

    doc.pipe(res);
    await generarEtiquetaPagina(doc, guia, true);
    doc.end();
  } catch (err) {
    if (!res.headersSent) return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/etiquetas/bulk
router.post('/bulk', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('etiquetas.generar'), async (req, res) => {
  try {
    const guiaIds = Array.isArray(req.body?.guia_ids) ? req.body.guia_ids : [];
    if (guiaIds.length === 0) {
      return res.status(400).json({ error: 'guia_ids requerido (array de UUIDs)' });
    }
    if (guiaIds.length > 100) {
      return res.status(400).json({ error: 'Maximo 100 etiquetas por solicitud' });
    }

    let query = supabase
      .from('guias')
      .select('*, empresas(nombre)')
      .in('id', guiaIds);

    if (req.user.rol === 'empresa') {
      query = query.eq('empresa_id', req.user.empresa_id);
    }

    const { data: guias, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    if (!guias || guias.length === 0) return res.status(404).json({ error: 'No se encontraron guias' });

    const byId = new Map((guias || []).map((g) => [g.id, g]));
    const orderedGuias = guiaIds.map((id) => byId.get(id)).filter(Boolean);

    const fecha = new Date().toISOString().slice(0, 10);
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="etiquetas-bulk-${fecha}.pdf"`);

    doc.pipe(res);

    for (let i = 0; i < orderedGuias.length; i++) {
      await generarEtiquetaPagina(doc, orderedGuias[i], i === 0);
    }

    doc.end();
  } catch (err) {
    if (!res.headersSent) return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
