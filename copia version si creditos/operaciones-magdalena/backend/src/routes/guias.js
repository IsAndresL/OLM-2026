const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const supabase = require('../config/supabase');
const { verificarToken, checkRole } = require('../middlewares/auth');

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// ── Helper: filtrar por empresa según rol ──
function filtrarPorEmpresa(req, query) {
  if (req.user.rol === 'empresa') {
    return query.eq('empresa_id', req.user.empresa_id);
  }
  return query; // admin ve todo
}

// ── GET /api/v1/guias — listar con filtros y paginación ──
router.get('/', verificarToken, checkRole(['admin', 'empresa']), async (req, res) => {
  try {
    const { estado, empresa_id, repartidor_id, fecha_desde, fecha_hasta, q, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('guias')
      .select(`
        id, numero_guia, estado_actual, nombre_remitente, nombre_destinatario,
        telefono_destinatario, direccion_destinatario, ciudad_destino, barrio,
        descripcion_paquete, peso_kg, valor_declarado, observaciones,
        fecha_estimada_entrega, etiqueta_pdf_url, created_at, updated_at,
        empresa_id, repartidor_id
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Filtro por empresa automáticamente
    query = filtrarPorEmpresa(req, query);

    if (estado)        query = query.eq('estado_actual', estado);
    if (empresa_id && req.user.rol === 'admin') query = query.eq('empresa_id', empresa_id);
    if (repartidor_id) query = query.eq('repartidor_id', repartidor_id);
    if (fecha_desde)   query = query.gte('created_at', fecha_desde);
    if (fecha_hasta)   query = query.lte('created_at', fecha_hasta + 'T23:59:59');
    if (q) {
      query = query.or(`numero_guia.ilike.%${q}%,nombre_destinatario.ilike.%${q}%,telefono_destinatario.ilike.%${q}%`);
    }

    const { data: guias, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Enrich with empresa and repartidor names
    const empresaIds = [...new Set(guias.map(g => g.empresa_id).filter(Boolean))];
    const repartidorIds = [...new Set(guias.map(g => g.repartidor_id).filter(Boolean))];

    let empresasMap = {};
    let repartidoresMap = {};

    if (empresaIds.length > 0) {
      const { data: empresas } = await supabase.from('empresas').select('id, nombre').in('id', empresaIds);
      empresas?.forEach(e => { empresasMap[e.id] = e.nombre; });
    }
    if (repartidorIds.length > 0) {
      const { data: repartidores } = await supabase.from('usuarios').select('id, nombre_completo').in('id', repartidorIds);
      repartidores?.forEach(r => { repartidoresMap[r.id] = r.nombre_completo; });
    }

    const enriched = guias.map(g => ({
      ...g,
      empresa_nombre: empresasMap[g.empresa_id] || null,
      repartidor_nombre: repartidoresMap[g.repartidor_id] || null,
    }));

    return res.json({ data: enriched, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/guias/:id — detalle ──
router.get('/:id', verificarToken, checkRole(['admin', 'empresa', 'repartidor']), async (req, res) => {
  try {
    const { data: guia, error } = await supabase
      .from('guias')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !guia) return res.status(404).json({ error: 'Guía no encontrada' });

    // Verificar acceso por empresa
    if (req.user.rol === 'empresa' && guia.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Sin acceso a esta guía' });
    }

    // Get empresa name
    const { data: empresa } = await supabase.from('empresas').select('id, nombre').eq('id', guia.empresa_id).single();

    // Get repartidor name
    let repartidor = null;
    if (guia.repartidor_id) {
      const { data: rep } = await supabase.from('usuarios').select('id, nombre_completo').eq('id', guia.repartidor_id).single();
      repartidor = rep;
    }

    // Get historial
    const { data: historial } = await supabase
      .from('historial_estados')
      .select('id, estado, nota, usuario_id, foto_evidencia_url, created_at')
      .eq('guia_id', guia.id)
      .order('created_at', { ascending: false });

    // Construir URLs firmadas para las fotos del historial almacenadas como rutas relativas
    const historialSigned = await Promise.all((historial || []).map(async (h) => {
      let signedUrl = h.foto_evidencia_url;
      if (signedUrl && !signedUrl.startsWith('http')) {
        const { data, error: signError } = await supabase.storage.from('evidencias').createSignedUrl(signedUrl, 3600); // Expira en 1 hora
        if (data && !signError) {
          signedUrl = data.signedUrl;
        }
      }
      return { ...h, foto_evidencia_url: signedUrl };
    }));

    return res.json({ ...guia, empresa, repartidor, historial: historialSigned });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/guias — crear guía individual ──
router.post('/', verificarToken, checkRole(['admin', 'empresa']), async (req, res) => {
  try {
    const { nombre_remitente, nombre_destinatario, telefono_destinatario,
            direccion_destinatario, ciudad_destino, barrio, descripcion_paquete,
            peso_kg, valor_declarado, observaciones, fecha_estimada_entrega, empresa_id } = req.body;

    if (!nombre_remitente || !nombre_destinatario || !telefono_destinatario || !direccion_destinatario || !ciudad_destino) {
      return res.status(400).json({ error: 'Faltan campos requeridos: nombre_remitente, nombre_destinatario, telefono_destinatario, direccion_destinatario, ciudad_destino' });
    }

    // Determine empresa_id
    let finalEmpresaId;
    if (req.user.rol === 'empresa') {
      finalEmpresaId = req.user.empresa_id;
    } else {
      if (!empresa_id) return res.status(400).json({ error: 'empresa_id es requerido para admin' });
      finalEmpresaId = empresa_id;
    }

    // Generate numero_guia
    const { data: numData, error: numError } = await supabase.rpc('generar_numero_guia');
    if (numError) return res.status(500).json({ error: 'Error generando número de guía: ' + numError.message });

    const guiaData = {
      numero_guia: numData,
      empresa_id: finalEmpresaId,
      estado_actual: 'registrado',
      nombre_remitente, nombre_destinatario, telefono_destinatario,
      direccion_destinatario, ciudad_destino,
      barrio: barrio || null,
      descripcion_paquete: descripcion_paquete || null,
      peso_kg: peso_kg || null,
      valor_declarado: valor_declarado || null,
      observaciones: observaciones || null,
      fecha_estimada_entrega: fecha_estimada_entrega || null,
    };

    const { data: guia, error: insertError } = await supabase
      .from('guias').insert(guiaData).select().single();
    if (insertError) return res.status(500).json({ error: insertError.message });

    // Insert historial
    await supabase.from('historial_estados').insert({
      guia_id: guia.id, estado: 'registrado', usuario_id: req.user.id, nota: 'Guía registrada'
    });

    return res.status(201).json(guia);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/guias/bulk — carga masiva ──
router.post('/bulk', verificarToken, checkRole(['admin', 'empresa']), upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido (campo: archivo)' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rows.length === 0) return res.status(400).json({ error: 'El archivo está vacío' });

    // Normalize column headers (case-insensitive)
    const normalizedRows = rows.map(row => {
      const normalized = {};
      Object.keys(row).forEach(key => { normalized[key.toLowerCase().trim()] = row[key]; });
      return normalized;
    });

    const requiredFields = ['nombre_remitente', 'nombre_destinatario', 'telefono_destinatario', 'direccion_destinatario', 'ciudad_destino'];
    let creadas = 0;
    const errores = [];

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      const fila = i + 2; // Excel row (header = 1)

      // Validate required fields
      const missing = requiredFields.filter(f => !row[f] || String(row[f]).trim() === '');
      if (missing.length > 0) {
        errores.push({ fila, motivo: `Campos vacíos: ${missing.join(', ')}` });
        continue;
      }

      // Generate numero_guia
      const { data: numData, error: numError } = await supabase.rpc('generar_numero_guia');
      if (numError) {
        errores.push({ fila, motivo: 'Error generando número de guía' });
        continue;
      }

      let finalEmpresaId = req.user.rol === 'empresa' ? req.user.empresa_id : (row.empresa_id || req.body.empresa_id);
      if (!finalEmpresaId) {
        errores.push({ fila, motivo: 'empresa_id no proporcionado' });
        continue;
      }

      const guiaData = {
        numero_guia: numData,
        empresa_id: finalEmpresaId,
        estado_actual: 'registrado',
        nombre_remitente: String(row.nombre_remitente).trim(),
        nombre_destinatario: String(row.nombre_destinatario).trim(),
        telefono_destinatario: String(row.telefono_destinatario).trim(),
        direccion_destinatario: String(row.direccion_destinatario).trim(),
        ciudad_destino: String(row.ciudad_destino).trim(),
        barrio: row.barrio ? String(row.barrio).trim() : null,
        descripcion_paquete: row.descripcion_paquete ? String(row.descripcion_paquete).trim() : null,
        peso_kg: row.peso_kg ? parseFloat(row.peso_kg) : null,
        valor_declarado: row.valor_declarado ? parseFloat(row.valor_declarado) : null,
      };

      const { data: guia, error: insertError } = await supabase
        .from('guias').insert(guiaData).select().single();

      if (insertError) {
        errores.push({ fila, motivo: insertError.message });
        continue;
      }

      await supabase.from('historial_estados').insert({
        guia_id: guia.id, estado: 'registrado', usuario_id: req.user.id, nota: 'Guía registrada (carga masiva)'
      });
      creadas++;
    }

    return res.json({ creadas, errores: errores.length, detalle_errores: errores });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/v1/guias/:id — editar guía ──
router.put('/:id', verificarToken, checkRole(['admin', 'empresa']), async (req, res) => {
  try {
    const { data: guia, error: findError } = await supabase
      .from('guias').select('*').eq('id', req.params.id).single();

    if (findError || !guia) return res.status(404).json({ error: 'Guía no encontrada' });
    // Admin can edit in almost any state to fix issues (like incorrect address)
    // Empresa can only edit if 'registrado'
    if (req.user.rol === 'empresa' && guia.estado_actual !== 'registrado') {
      return res.status(409).json({ error: 'Solo se pueden editar guías en estado "registrado"' });
    }
    
    if (req.user.rol === 'empresa' && guia.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Sin acceso a esta guía' });
    }

    // Fields that can be edited
    const { 
      nombre_remitente, nombre_destinatario, telefono_destinatario,
      direccion_destinatario, ciudad_destino, barrio, descripcion_paquete,
      peso_kg, valor_declarado, observaciones, fecha_estimada_entrega,
      estado_actual, nota_admin 
    } = req.body;

    const updateData = {};
    if (nombre_remitente !== undefined)       updateData.nombre_remitente = nombre_remitente;
    if (nombre_destinatario !== undefined)    updateData.nombre_destinatario = nombre_destinatario;
    if (telefono_destinatario !== undefined)  updateData.telefono_destinatario = telefono_destinatario;
    if (direccion_destinatario !== undefined) updateData.direccion_destinatario = direccion_destinatario;
    if (ciudad_destino !== undefined)         updateData.ciudad_destino = ciudad_destino;
    if (barrio !== undefined)                 updateData.barrio = barrio;
    if (descripcion_paquete !== undefined)    updateData.descripcion_paquete = descripcion_paquete;
    if (peso_kg !== undefined)               updateData.peso_kg = peso_kg;
    if (valor_declarado !== undefined)        updateData.valor_declarado = valor_declarado;
    if (observaciones !== undefined)          updateData.observaciones = observaciones;
    if (fecha_estimada_entrega !== undefined) updateData.fecha_estimada_entrega = fecha_estimada_entrega;
    
    // Only Admin can force a state change during edit
    if (req.user.rol === 'admin' && estado_actual !== undefined) {
      updateData.estado_actual = estado_actual;
    }

    const { data: updated, error: updateError } = await supabase
      .from('guias').update(updateData).eq('id', req.params.id).select().single();
    
    if (updateError) return res.status(500).json({ error: updateError.message });

    // If state changed or specific correction note added, create history
    if (estado_actual || nota_admin) {
      await supabase.from('historial_estados').insert({
        guia_id: updated.id,
        estado: updated.estado_actual,
        usuario_id: req.user.id,
        nota: nota_admin || 'Corrección de datos por Administrador'
      });
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/v1/guias/:id/asignar — asignar repartidor ──
router.patch('/:id/asignar', verificarToken, checkRole(['admin']), async (req, res) => {
  try {
    const { repartidor_id } = req.body;
    if (!repartidor_id) return res.status(400).json({ error: 'repartidor_id requerido' });

    // Verify repartidor exists and has correct role
    const { data: repartidor, error: repError } = await supabase
      .from('usuarios').select('id, nombre_completo, rol').eq('id', repartidor_id).single();
    if (repError || !repartidor) return res.status(404).json({ error: 'Repartidor no encontrado' });
    if (repartidor.rol !== 'repartidor') return res.status(400).json({ error: 'El usuario no es un repartidor' });

    const { data: guia, error: updateError } = await supabase
      .from('guias')
      .update({ repartidor_id, estado_actual: 'asignado' })
      .eq('id', req.params.id)
      .select().single();
    if (updateError) return res.status(500).json({ error: updateError.message });

    await supabase.from('historial_estados').insert({
      guia_id: guia.id, estado: 'asignado', usuario_id: req.user.id,
      nota: `Asignado a: ${repartidor.nombre_completo}`
    });

    // Enviar notificación WhatsApp de que fue asignado
    const { enviarNotificacion } = require('../services/whatsappService');
    const { data: fullGuia } = await supabase.from('guias').select('*').eq('id', req.params.id).single();
    if (fullGuia) {
       enviarNotificacion(fullGuia, 'asignado');
    }

    return res.json(guia);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/v1/guias/:id ──
router.delete('/:id', verificarToken, checkRole(['admin']), async (req, res) => {
  try {
    const { data: guia, error: findError } = await supabase
      .from('guias').select('id, estado_actual').eq('id', req.params.id).single();

    if (findError || !guia) return res.status(404).json({ error: 'Guía no encontrada' });
    if (guia.estado_actual !== 'registrado') {
      return res.status(409).json({ error: 'Solo se pueden eliminar guías en estado "registrado"' });
    }

    // Delete historial first (cascade should handle it, but to be safe)
    await supabase.from('historial_estados').delete().eq('guia_id', req.params.id);
    const { error: deleteError } = await supabase.from('guias').delete().eq('id', req.params.id);
    if (deleteError) return res.status(500).json({ error: deleteError.message });

    return res.json({ message: 'Guía eliminada' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
