const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
    ];
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const allowedExt = ['xlsx', 'csv'];
    if (allowedMimes.includes(file.mimetype) && allowedExt.includes(ext)) return cb(null, true);
    return cb(new Error('Tipo de archivo no permitido. Usa .xlsx o .csv'));
  },
}); // 5MB

function sanitizeSearchTerm(value = '') {
  const cleaned = String(value)
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned;
}

function normalizeHeaderKey(value = '') {
  return String(value)
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const BULK_KEY_ALIASES = {
  // Required fields
  nombre_remitente: 'nombre_remitente',
  remitente: 'nombre_remitente',
  nombre_destinatario: 'nombre_destinatario',
  destinatario: 'nombre_destinatario',
  telefono_destinatario: 'telefono_destinatario',
  telefono: 'telefono_destinatario',
  celular: 'telefono_destinatario',
  direccion_destinatario: 'direccion_destinatario',
  direccion: 'direccion_destinatario',
  ciudad_destino: 'ciudad_destino',
  ciudad: 'ciudad_destino',
  // Optional
  empresa_id: 'empresa_id',
  barrio: 'barrio',
  descripcion_paquete: 'descripcion_paquete',
  descripcion: 'descripcion_paquete',
  peso_kg: 'peso_kg',
  peso: 'peso_kg',
  valor_declarado: 'valor_declarado',
  valor: 'valor_declarado',
  zona_id: 'zona_id',
  lat: 'lat',
  lng: 'lng',
  ing: 'lng',
  long: 'lng',
  longitud: 'lng',
};

function toBulkCanonicalKey(value = '') {
  const normalized = normalizeHeaderKey(value);
  return BULK_KEY_ALIASES[normalized] || normalized;
}

function detectDelimiter(line = '') {
  if (line.includes(';')) return ';';
  if (line.includes('\t')) return '\t';
  if (line.includes(',')) return ',';
  return null;
}

function splitByDelimiter(line = '', delimiter = ',') {
  // Parser simple suficiente para archivos de plantilla sin comillas complejas
  return String(line).split(delimiter).map((part) => part.trim());
}

function normalizeRowForBulk(row) {
  const normalized = {};
  const rawKeys = Object.keys(row || {});

  if (rawKeys.length === 1) {
    const singleKey = rawKeys[0];
    const delimiter = detectDelimiter(singleKey);
    if (delimiter) {
      const headerParts = splitByDelimiter(singleKey, delimiter);
      const valueParts = splitByDelimiter(row[singleKey], delimiter);
      headerParts.forEach((header, idx) => {
        const key = toBulkCanonicalKey(header);
        normalized[key] = valueParts[idx] !== undefined ? valueParts[idx] : '';
      });
      return normalized;
    }
  }

  rawKeys.forEach((key) => {
    const canonical = toBulkCanonicalKey(key);
    normalized[canonical] = row[key];
  });

  return normalized;
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().replace(',', '.');
  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}

async function signStoragePath(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return path;
  return data.signedUrl;
}

function isIgnorableSchemaError(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true; // relation/column does not exist
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('no existe');
}

async function safeDeleteIn(table, column, values) {
  const { error } = await supabase.from(table).delete().in(column, values);
  if (error && !isIgnorableSchemaError(error)) return error;
  return null;
}

async function safeDeleteEq(table, column, value) {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error && !isIgnorableSchemaError(error)) return error;
  return null;
}

// ── Helper: filtrar por empresa según rol ──
function filtrarPorEmpresa(req, query) {
  if (req.user.rol === 'empresa') {
    return query.eq('empresa_id', req.user.empresa_id);
  }
  return query; // admin ve todo
}

// ── GET /api/v1/guias — listar con filtros y paginación ──
router.get('/', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('guias.view'), async (req, res) => {
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
        empresa_id, repartidor_id, zona_id, lat, lng
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
      const safeQ = sanitizeSearchTerm(q);
      if (safeQ) {
        query = query.or(`numero_guia.ilike.%${safeQ}%,nombre_destinatario.ilike.%${safeQ}%,telefono_destinatario.ilike.%${safeQ}%`);
      }
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
router.get('/:id', verificarToken, checkRole(['admin', 'empresa', 'repartidor']), checkAdminPermission('guias.view'), async (req, res) => {
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
      .select('id, estado, nota, usuario_id, foto_evidencia_url, firma_url, nombre_receptor, cedula_receptor, created_at')
      .eq('guia_id', guia.id)
      .order('created_at', { ascending: false });

    // Construir URLs firmadas para foto y firma del historial almacenadas como rutas relativas
    const historialSigned = await Promise.all((historial || []).map(async (h) => {
      const fotoFirmada = await signStoragePath('evidencias', h.foto_evidencia_url);
      const firmaFirmada = await signStoragePath('firmas', h.firma_url);
      return {
        ...h,
        foto_evidencia_url: fotoFirmada,
        firma_url: firmaFirmada,
      };
    }));

    return res.json({ ...guia, empresa, repartidor, historial: historialSigned });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/guias — crear guía individual ──
router.post('/', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('guias.create'), async (req, res) => {
  try {
    const { nombre_remitente, nombre_destinatario, telefono_destinatario,
            direccion_destinatario, ciudad_destino, barrio, descripcion_paquete,
          peso_kg, valor_declarado, observaciones, fecha_estimada_entrega,
          empresa_id, zona_id, lat, lng } = req.body;

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
      zona_id: zona_id || null,
      lat: lat !== undefined && lat !== null && lat !== '' ? Number(lat) : null,
      lng: lng !== undefined && lng !== null && lng !== '' ? Number(lng) : null,
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
router.post('/bulk', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('guias.create'), upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido (campo: archivo)' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rows.length === 0) return res.status(400).json({ error: 'El archivo está vacío' });

    // Normalize headers with aliases and flexible separators
    const normalizedRows = rows.map((row) => normalizeRowForBulk(row));

    const requiredFields = ['nombre_remitente', 'nombre_destinatario', 'telefono_destinatario', 'direccion_destinatario', 'ciudad_destino'];
    let creadas = 0;
    const errores = [];

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      const fila = i + 2; // Excel row (header = 1)

      // Validate required fields
      const missing = requiredFields.filter((f) => !row[f] || String(row[f]).trim() === '');
      if (missing.length > 0) {
        errores.push({ fila, motivo: `Campos vacios o no detectados: ${missing.join(', ')}` });
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
        errores.push({ fila, motivo: 'empresa_id no proporcionado (selecciona empresa en modal o agrega empresa_id por fila)' });
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
        peso_kg: parseNullableNumber(row.peso_kg),
        valor_declarado: parseNullableNumber(row.valor_declarado),
        zona_id: row.zona_id ? String(row.zona_id).trim() : null,
        lat: parseNullableNumber(row.lat),
        lng: parseNullableNumber(row.lng),
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

    const columnasDetectadas = normalizedRows[0] ? Object.keys(normalizedRows[0]) : [];
    return res.json({ creadas, errores: errores.length, detalle_errores: errores, columnas_detectadas: columnasDetectadas });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/guias/bulk-delete — eliminacion masiva ──
router.post('/bulk-delete', verificarToken, checkRole(['admin']), checkAdminPermission('guias.delete'), async (req, res) => {
  try {
    const guiaIds = Array.isArray(req.body?.guia_ids) ? req.body.guia_ids : [];
    if (guiaIds.length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos una guia para eliminar' });
    }

    const idsLimpios = [...new Set(guiaIds.map((id) => String(id).trim()).filter(Boolean))];
    if (idsLimpios.length === 0) {
      return res.status(400).json({ error: 'Lista de guias invalida' });
    }

    const { data: existentes, error: findError } = await supabase
      .from('guias')
      .select('id')
      .in('id', idsLimpios);

    if (findError) return res.status(500).json({ error: findError.message });

    const idsExistentes = (existentes || []).map((g) => g.id);
    if (idsExistentes.length === 0) {
      return res.status(404).json({ error: 'No se encontraron guias para eliminar' });
    }

    const { error: histError } = await supabase
      .from('historial_estados')
      .delete()
      .in('guia_id', idsExistentes);
    if (histError) return res.status(500).json({ error: histError.message });

    const devPrincipalError = await safeDeleteIn('devoluciones', 'guia_id', idsExistentes);
    if (devPrincipalError) return res.status(500).json({ error: devPrincipalError.message });

    const devRetornoError = await safeDeleteIn('devoluciones', 'guia_retorno_id', idsExistentes);
    if (devRetornoError) return res.status(500).json({ error: devRetornoError.message });

    const liqGuiasError = await safeDeleteIn('liquidacion_guias', 'guia_id', idsExistentes);
    if (liqGuiasError) return res.status(500).json({ error: liqGuiasError.message });

    const { error: deleteError } = await supabase
      .from('guias')
      .delete()
      .in('id', idsExistentes);
    if (deleteError) return res.status(500).json({ error: deleteError.message });

    return res.json({
      eliminadas: idsExistentes.length,
      no_encontradas: idsLimpios.length - idsExistentes.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/guias/bulk-assign — asignacion masiva ──
router.post('/bulk-assign', verificarToken, checkRole(['admin']), checkAdminPermission('guias.assign'), async (req, res) => {
  try {
    const guiaIds = Array.isArray(req.body?.guia_ids) ? req.body.guia_ids : [];
    const repartidorId = req.body?.repartidor_id;

    if (!repartidorId) return res.status(400).json({ error: 'repartidor_id requerido' });
    if (guiaIds.length === 0) return res.status(400).json({ error: 'Debes seleccionar al menos una guia' });

    const idsLimpios = [...new Set(guiaIds.map((id) => String(id).trim()).filter(Boolean))];
    if (idsLimpios.length === 0) return res.status(400).json({ error: 'Lista de guias invalida' });

    const { data: repartidor, error: repError } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, rol')
      .eq('id', repartidorId)
      .single();
    if (repError || !repartidor) return res.status(404).json({ error: 'Repartidor no encontrado' });
    if (repartidor.rol !== 'repartidor') return res.status(400).json({ error: 'El usuario seleccionado no es repartidor' });

    const { data: guias, error: guiasError } = await supabase
      .from('guias')
      .select('id, estado_actual')
      .in('id', idsLimpios);
    if (guiasError) return res.status(500).json({ error: guiasError.message });

    const idsExistentes = (guias || []).map((g) => g.id);
    const idsAsignables = (guias || [])
      .filter((g) => g.estado_actual === 'registrado')
      .map((g) => g.id);

    if (idsAsignables.length === 0) {
      return res.status(409).json({ error: 'Ninguna guia seleccionada esta en estado registrado' });
    }

    const { error: updateError } = await supabase
      .from('guias')
      .update({ repartidor_id: repartidorId, estado_actual: 'asignado' })
      .in('id', idsAsignables);
    if (updateError) return res.status(500).json({ error: updateError.message });

    const historialRows = idsAsignables.map((id) => ({
      guia_id: id,
      estado: 'asignado',
      usuario_id: req.user.id,
      nota: `Asignado masivamente a: ${repartidor.nombre_completo}`,
    }));
    const { error: histError } = await supabase.from('historial_estados').insert(historialRows);
    if (histError) return res.status(500).json({ error: histError.message });

    return res.json({
      asignadas: idsAsignables.length,
      ids_asignadas: idsAsignables,
      omitidas_por_estado: idsExistentes.length - idsAsignables.length,
      no_encontradas: idsLimpios.length - idsExistentes.length,
      repartidor: { id: repartidor.id, nombre_completo: repartidor.nombre_completo },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/guias/bulk-assign/undo — deshacer asignacion ──
router.post('/bulk-assign/undo', verificarToken, checkRole(['admin']), checkAdminPermission('guias.assign'), async (req, res) => {
  try {
    const cambios = Array.isArray(req.body?.cambios) ? req.body.cambios : [];
    if (cambios.length === 0) return res.status(400).json({ error: 'No hay cambios para deshacer' });

    const normalizados = cambios
      .map((c) => ({
        id: c?.id ? String(c.id).trim() : '',
        estado_actual: c?.estado_actual ? String(c.estado_actual).trim() : '',
        repartidor_id: c?.repartidor_id ? String(c.repartidor_id).trim() : null,
      }))
      .filter((c) => c.id && c.estado_actual);

    if (normalizados.length === 0) {
      return res.status(400).json({ error: 'Formato de cambios invalido' });
    }

    const historialRows = [];
    for (const cambio of normalizados) {
      const { error: updateError } = await supabase
        .from('guias')
        .update({
          estado_actual: cambio.estado_actual,
          repartidor_id: cambio.repartidor_id || null,
        })
        .eq('id', cambio.id);

      if (updateError) {
        return res.status(500).json({ error: `No se pudo deshacer guia ${cambio.id}: ${updateError.message}` });
      }

      historialRows.push({
        guia_id: cambio.id,
        estado: cambio.estado_actual,
        usuario_id: req.user.id,
        nota: 'Asignacion deshecha por administrador',
      });
    }

    if (historialRows.length > 0) {
      const { error: histError } = await supabase.from('historial_estados').insert(historialRows);
      if (histError) return res.status(500).json({ error: histError.message });
    }

    return res.json({ restauradas: normalizados.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/v1/guias/:id — editar guía ──
router.put('/:id', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('guias.edit'), async (req, res) => {
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
      estado_actual, nota_admin, zona_id, lat, lng
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
    if (zona_id !== undefined)                updateData.zona_id = zona_id || null;
    if (lat !== undefined)                    updateData.lat = lat === '' || lat === null ? null : Number(lat);
    if (lng !== undefined)                    updateData.lng = lng === '' || lng === null ? null : Number(lng);
    
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

    // Si una guía pasa a devuelto, crear el registro de devolución automáticamente si no existe.
    if (req.user.rol === 'admin' && estado_actual === 'devuelto') {
      const { data: existente, error: devFindError } = await supabase
        .from('devoluciones')
        .select('id')
        .eq('guia_id', updated.id)
        .maybeSingle();

      if (devFindError) return res.status(500).json({ error: devFindError.message });

      if (!existente) {
        const motivoAuto = ['no_contesto', 'direccion_incorrecta'].includes(guia.estado_actual)
          ? guia.estado_actual
          : 'otro';

        const { error: devCreateError } = await supabase
          .from('devoluciones')
          .insert({
            guia_id: updated.id,
            guia_retorno_id: null,
            motivo: motivoAuto,
            descripcion: nota_admin || `Creado automaticamente al marcar la guia ${updated.numero_guia || updated.id} como devuelta`,
            estado: 'en_bodega',
            repartidor_id: updated.repartidor_id || null,
            admin_id: req.user.id,
            foto_paquete_url: null,
          });

        if (devCreateError) return res.status(500).json({ error: devCreateError.message });
      }
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/v1/guias/:id/asignar — asignar repartidor ──
router.patch('/:id/asignar', verificarToken, checkRole(['admin']), checkAdminPermission('guias.assign'), async (req, res) => {
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
router.delete('/:id', verificarToken, checkRole(['admin']), checkAdminPermission('guias.delete'), async (req, res) => {
  try {
    const { data: guia, error: findError } = await supabase
      .from('guias').select('id, estado_actual, numero_guia').eq('id', req.params.id).single();

    if (findError || !guia) return res.status(404).json({ error: 'Guía no encontrada' });

    // Delete historial first (cascade should handle it, but to be safe)
    await supabase.from('historial_estados').delete().eq('guia_id', req.params.id);
    const devPrincipalError = await safeDeleteEq('devoluciones', 'guia_id', req.params.id);
    if (devPrincipalError) return res.status(500).json({ error: devPrincipalError.message });

    const devRetornoError = await safeDeleteEq('devoluciones', 'guia_retorno_id', req.params.id);
    if (devRetornoError) return res.status(500).json({ error: devRetornoError.message });

    const liqGuiasError = await safeDeleteEq('liquidacion_guias', 'guia_id', req.params.id);
    if (liqGuiasError) return res.status(500).json({ error: liqGuiasError.message });
    const { error: deleteError } = await supabase.from('guias').delete().eq('id', req.params.id);
    if (deleteError) return res.status(500).json({ error: deleteError.message });

    return res.json({ message: `Guía eliminada (${guia.numero_guia || guia.id})` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
