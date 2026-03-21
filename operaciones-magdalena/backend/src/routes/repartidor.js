const express = require('express');
const multer = require('multer');
const supabase = require('../config/supabase');
const { verificarToken, checkRole } = require('../middlewares/auth');
const { enviarNotificacion } = require('../services/whatsappService');

const router = express.Router();

async function signStoragePath(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return path;
  return data.signedUrl;
}

const imageUpload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const allowedExt = ['jpg', 'jpeg', 'png', 'webp'];
    if (allowedMimes.includes(file.mimetype) && allowedExt.includes(ext)) return cb(null, true);
    return cb(new Error('Archivo no permitido. Solo imagenes JPG, PNG o WEBP'));
  },
}); // 5MB

// GET /api/v1/repartidor/mis-guias
router.get('/mis-guias', verificarToken, checkRole(['repartidor']), async (req, res) => {
  try {
    const { fecha, estado } = req.query;
    let query = supabase
      .from('guias')
      .select(`
        id, numero_guia, estado_actual,
        nombre_destinatario, telefono_destinatario,
        direccion_destinatario, ciudad_destino, barrio,
        descripcion_paquete, peso_kg,
        es_cod, monto_cod, cod_cobrado, cod_metodo, cod_estado,
        historial_estados ( estado, nota, created_at, foto_evidencia_url, firma_url, nombre_receptor, cedula_receptor )
      `)
      .eq('repartidor_id', req.user.id);

    // Filtrar por estados
    if (estado === 'asignado' || estado === 'en_ruta' || estado === 'entregado') {
      query = query.eq('estado_actual', estado);
    } else {
      // Por defecto estados "activos"
      query = query.in('estado_actual', ['asignado', 'en_ruta', 'no_contesto', 'reagendar', 'direccion_incorrecta']);
    }

    // Filtrar por fecha
    if (fecha) {
        query = query.gte('created_at', fecha + 'T00:00:00')
                     .lte('created_at', fecha + 'T23:59:59');
    }

    const { data: guias, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Format latest historial
    const formatted = await Promise.all((guias || []).map(async (g) => {
        // Find latest history record
        const sortedHistorial = g.historial_estados ? g.historial_estados.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
        const ultimoEstadoRaw = sortedHistorial.length > 0 ? sortedHistorial[0] : null;
        let ultimo_estado = ultimoEstadoRaw;

        if (ultimoEstadoRaw) {
          const fotoUrl = await signStoragePath('evidencias', ultimoEstadoRaw.foto_evidencia_url);
          const firmaUrl = await signStoragePath('firmas', ultimoEstadoRaw.firma_url);
          ultimo_estado = {
            ...ultimoEstadoRaw,
            foto_evidencia_url: fotoUrl,
            firma_url: firmaUrl,
          };
        }
        
        // Remove the array to save payload size, just keep the latest
        delete g.historial_estados;
        
        return {
            ...g,
            ultimo_estado
        };
    }));

    // Ordenar: primero en_ruta, luego asignado, luego el resto
    formatted.sort((a, b) => {
        const priority = { 'en_ruta': 1, 'asignado': 2, 'reagendar': 3, 'no_contesto': 4, 'direccion_incorrecta': 5 };
        const pA = priority[a.estado_actual] || 99;
        const pB = priority[b.estado_actual] || 99;
        return pA - pB;
    });

    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/repartidor/guias/:guia_id/estado
router.post('/guias/:guia_id/estado', verificarToken, checkRole(['repartidor']), async (req, res) => {
  try {
    const { guia_id } = req.params;
    const { estado, nota, foto_evidencia_url, firma_url, nombre_receptor, cedula_receptor } = req.body;

    const validEstados = ['en_ruta', 'entregado', 'no_contesto', 'direccion_incorrecta', 'reagendar'];
    if (!validEstados.includes(estado)) {
      return res.status(400).json({ error: 'Estado no permitido para repartidor' });
    }

    if ((estado === 'entregado' || estado === 'no_contesto') && !nota) {
      return res.status(400).json({ error: 'La nota es obligatoria para este estado' });
    }

    // Verificar propiedad
    const { data: guia, error: findError } = await supabase
      .from('guias').select('*').eq('id', guia_id).single();
      
    if (findError || !guia) return res.status(404).json({ error: 'Guía no encontrada' });
    if (guia.repartidor_id !== req.user.id) return res.status(403).json({ error: 'Esta guía no te pertenece' });

    // Actualizar guía y crear historial
    const { error: updateError } = await supabase
      .from('guias').update({ estado_actual: estado }).eq('id', guia_id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    const { data: historial, error: histError } = await supabase
      .from('historial_estados').insert({
        guia_id,
        estado,
        nota: nota || '',
        usuario_id: req.user.id,
        foto_evidencia_url: foto_evidencia_url || null,
        firma_url: firma_url || null,
        nombre_receptor: nombre_receptor || null,
        cedula_receptor: cedula_receptor || null,
      }).select().single();
      
    if (histError) return res.status(500).json({ error: histError.message });

    // Disparar WhatsApp (best effort)
    enviarNotificacion(guia, estado);

    return res.json({ guia_id, nuevo_estado: estado, historial_id: historial.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/repartidor/evidencia/:guia_id
router.post('/evidencia/:guia_id', verificarToken, checkRole(['repartidor']), imageUpload.single('foto'), async (req, res) => {
  try {
    const { guia_id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Foto requerida' });

    // Verificar propiedad
    const { data: guia, error: findError } = await supabase
      .from('guias').select('repartidor_id').eq('id', guia_id).single();
      
    if (findError || !guia) return res.status(404).json({ error: 'Guía no encontrada' });
    if (guia.repartidor_id !== req.user.id) return res.status(403).json({ error: 'Esta guía no te pertenece' });

    // Subir a Supabase Storage
    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const filePath = `evidencias/${guia_id}/${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('evidencias')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (uploadError) return res.status(500).json({ error: 'Error subiendo evidencia: ' + uploadError.message });

    // Eliminamos el getPublicUrl ya que el bucket será Privado
    // Devolvemos la ruta relativa para que luego guias.js genere URLs firmadas (Signed URLs)
    return res.json({ foto_url: filePath });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/repartidor/firma/:guia_id
router.post('/firma/:guia_id', verificarToken, checkRole(['repartidor']), imageUpload.single('firma'), async (req, res) => {
  try {
    const { guia_id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Firma requerida' });

    const { data: guia, error: findError } = await supabase
      .from('guias').select('repartidor_id').eq('id', guia_id).single();

    if (findError || !guia) return res.status(404).json({ error: 'Guia no encontrada' });
    if (guia.repartidor_id !== req.user.id) return res.status(403).json({ error: 'Esta guia no te pertenece' });

    const timestamp = Date.now();
    const filePath = `firmas/${guia_id}/${timestamp}.png`;

    const { error: uploadError } = await supabase.storage
      .from('firmas')
      .upload(filePath, req.file.buffer, { contentType: 'image/png', upsert: false });

    if (uploadError) return res.status(500).json({ error: `Error subiendo firma: ${uploadError.message}` });

    return res.json({ firma_url: filePath });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
