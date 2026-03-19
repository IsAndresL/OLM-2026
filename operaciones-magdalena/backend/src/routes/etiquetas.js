const express    = require('express');
const PDFDocument = require('pdfkit');
const QRCode     = require('qrcode');
const bwipjs     = require('bwip-js');
const supabase   = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();

// ── Helper: generate label for a single guia ──
async function generarEtiquetaPagina(doc, guia, isFirst) {
  if (!isFirst) doc.addPage({ size: [283, 425], margin: 10 });

  // QR Code
  const qrBuffer = await QRCode.toBuffer(guia.numero_guia, { width: 80, margin: 1 });

  // Barcode Code 128
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: guia.numero_guia,
    scale: 2,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });

  // Header: company name
  doc.fontSize(9).font('Helvetica-Bold')
     .text('Operaciones Logísticas del Magdalena', 10, 12, { width: 180 });

  // QR top-right
  doc.image(qrBuffer, 200, 8, { width: 70 });

  // Destinatario box
  doc.rect(10, 55, 263, 95).stroke();
  doc.fontSize(7).font('Helvetica-Bold').text('DESTINATARIO', 14, 60);
  doc.fontSize(10).font('Helvetica-Bold')
     .text(guia.nombre_destinatario, 14, 72, { width: 255 });
  doc.fontSize(8).font('Helvetica')
     .text(guia.direccion_destinatario, 14, 90, { width: 255 });
  if (guia.barrio) doc.text(`Barrio: ${guia.barrio}`, 14, 110);
  doc.text(`${guia.ciudad_destino}`, 14, 122);
  doc.text(`Tel: ${guia.telefono_destinatario}`, 14, 134);

  // Remitente and guia info
  doc.fontSize(8).font('Helvetica')
     .text(`De: ${guia.nombre_remitente}`, 10, 160);
  doc.font('Helvetica-Bold').text(`Guía: ${guia.numero_guia}`, 10, 172);
  doc.font('Helvetica')
     .text(`Fecha: ${new Date(guia.created_at).toLocaleDateString('es-CO')}`, 10, 184);
  if (guia.peso_kg) doc.text(`Peso: ${guia.peso_kg} kg`, 10, 196);
  if (guia.descripcion_paquete) {
    doc.fontSize(7).text(`Desc: ${guia.descripcion_paquete}`, 10, 210, { width: 263 });
  }

  // Barcode at bottom
  doc.image(barcodeBuffer, 10, 310, { width: 263, height: 60 });
}

// ── GET /api/v1/etiquetas/:guia_id — single label PDF ──
router.get('/:guia_id', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('etiquetas.generar'), async (req, res) => {
  try {
    const { data: guia, error } = await supabase
      .from('guias').select('*').eq('id', req.params.guia_id).single();
    if (error || !guia) return res.status(404).json({ error: 'Guía no encontrada' });

    if (req.user.rol === 'empresa' && guia.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Sin acceso a esta guía' });
    }

    const doc = new PDFDocument({ size: [283, 425], margin: 10 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${guia.numero_guia}.pdf"`);
    doc.pipe(res);

    await generarEtiquetaPagina(doc, guia, true);
    doc.end();
  } catch (err) {
    if (!res.headersSent) return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/etiquetas/bulk — multiple labels in one PDF ──
router.post('/bulk', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('etiquetas.generar'), async (req, res) => {
  try {
    const { guia_ids } = req.body;
    if (!guia_ids || !Array.isArray(guia_ids) || guia_ids.length === 0) {
      return res.status(400).json({ error: 'guia_ids requerido (array de UUIDs)' });
    }
    if (guia_ids.length > 100) {
      return res.status(400).json({ error: 'Máximo 100 etiquetas por solicitud' });
    }

    let query = supabase.from('guias').select('*').in('id', guia_ids);
    if (req.user.rol === 'empresa') {
      query = query.eq('empresa_id', req.user.empresa_id);
    }

    const { data: guias, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    if (!guias || guias.length === 0) return res.status(404).json({ error: 'No se encontraron guías' });

    const fecha = new Date().toISOString().slice(0, 10);
    const doc = new PDFDocument({ size: [283, 425], margin: 10 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="etiquetas-bulk-${fecha}.pdf"`);
    doc.pipe(res);

    for (let i = 0; i < guias.length; i++) {
      await generarEtiquetaPagina(doc, guias[i], i === 0);
    }

    doc.end();
  } catch (err) {
    if (!res.headersSent) return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
