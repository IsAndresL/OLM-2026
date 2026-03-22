const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

async function generateBarcodeBuffer(numeroGuia) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: String(numeroGuia || 'SIN-GUIA'),
    scale: 2,
    height: 10,
    includetext: false,
  });
}

function drawHeader(doc, guia) {
  doc.rect(20, 20, 255, 36).fill('#1D4ED8');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
    .text('Operaciones Logisticas del Magdalena', 28, 30, { width: 170 });
  doc.fontSize(9).text(String(guia.numero_guia || 'SIN-GUIA'), 200, 32, { width: 65, align: 'right' });
}

function drawInfo(doc, guia) {
  const y = 70;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
    .text('DESTINATARIO', 20, y);
  doc.fontSize(13).text(String(guia.nombre_destinatario || 'Sin destinatario'), 20, y + 14, { width: 255 });

  doc.fillColor('#374151').font('Helvetica').fontSize(9)
    .text(String(guia.direccion_destinatario || 'Direccion por confirmar'), 20, y + 36, { width: 255 });

  const barrio = guia.barrio ? `Barrio: ${guia.barrio}` : null;
  if (barrio) {
    doc.text(barrio, 20, y + 50, { width: 255 });
  }

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
    .text(String(guia.ciudad_destino || 'Ciudad por confirmar'), 20, y + 64, { width: 255 });

  doc.fillColor('#1D4ED8').font('Helvetica-Bold').fontSize(9)
    .text(`Tel: ${String(guia.telefono_destinatario || '--')}`, 20, y + 78, { width: 255 });

  doc.fillColor('#6B7280').font('Helvetica').fontSize(8)
    .text(`Remitente: ${String(guia.nombre_remitente || '--')}`, 20, y + 96, { width: 255 });
}

async function generateEtiquetaAdjuntaPdfBuffer(guia) {
  const doc = new PDFDocument({ size: [283, 425], margin: 0 });
  const chunks = [];

  return new Promise(async (resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      drawHeader(doc, guia);
      drawInfo(doc, guia);

      const barcodeBuffer = await generateBarcodeBuffer(guia.numero_guia);
      doc.image(barcodeBuffer, 20, 260, { fit: [243, 64], align: 'center' });

      doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8)
        .text(String(guia.numero_guia || 'SIN-GUIA'), 20, 332, { width: 243, align: 'center' });

      doc.fillColor('#9CA3AF').font('Helvetica').fontSize(7)
        .text('Etiqueta de entrega adjunta al estado EN RUTA', 20, 352, { width: 243, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateEtiquetaAdjuntaPdfBuffer };
