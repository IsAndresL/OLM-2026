const express  = require('express');
const multer = require('multer');
const supabase = require('../config/supabase');
const {
  verificarToken,
  checkRole,
  checkAdminPermission,
  ADMIN_PERMISSION_KEYS,
  normalizeAdminPermissions,
  adminHasPermission,
} = require('../middlewares/auth');
const router = express.Router();
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const allowedExt = ['jpg', 'jpeg', 'png', 'webp'];
    if (allowedMimes.includes(file.mimetype) && allowedExt.includes(ext)) return cb(null, true);
    return cb(new Error('Archivo no permitido. Solo imagenes JPG, PNG o WEBP'));
  },
}); // 5MB

function defaultAdminPermissions() {
  return normalizeAdminPermissions({
    'dashboard.view': true,
    'guias.view': true,
  });
}

function sanitizePermisos(inputPermisos, esPrincipal) {
  if (!inputPermisos || typeof inputPermisos !== 'object') {
    return esPrincipal ? normalizeAdminPermissions({}, true) : defaultAdminPermissions();
  }

  const filtered = {};
  ADMIN_PERMISSION_KEYS.forEach((key) => {
    filtered[key] = inputPermisos[key] === true;
  });

  return normalizeAdminPermissions(filtered, esPrincipal);
}

function mapPresenceState(usuario) {
  const rawLastActivity = usuario.last_activity_at || null;
  const lastActivityTs = rawLastActivity ? new Date(rawLastActivity).getTime() : 0;
  const isRecentlyActive = lastActivityTs > 0 && (Date.now() - lastActivityTs) <= ONLINE_WINDOW_MS;

  return {
    ...usuario,
    last_activity_at: rawLastActivity,
    is_online: Boolean(usuario.is_online) && isRecentlyActive,
    online_timeout_seconds: Math.floor(ONLINE_WINDOW_MS / 1000),
  };
}

// GET /api/v1/usuarios
router.get('/', verificarToken, checkRole(['admin']), checkAdminPermission('usuarios.view'), async (req, res) => {
  const { rol, activo } = req.query;
  let query = supabase
    .from('usuarios')
    .select('id, nombre_completo, email, rol, telefono, empresa_id, identificacion, activo, avatar_url, es_principal, permisos, created_at, last_activity_at, is_online, empresa:empresas(id, nombre, nit, email, telefono)')
    .order('created_at', { ascending: false });
  if (rol)    query = query.eq('rol', rol);
  if (activo !== undefined) query = query.eq('activo', activo === 'true');
  let { data, error } = await query;

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    const missingPresenceColumns = msg.includes('last_activity_at') || msg.includes('is_online');
    if (missingPresenceColumns) {
      let fallbackQuery = supabase
        .from('usuarios')
        .select('id, nombre_completo, email, rol, telefono, empresa_id, identificacion, activo, avatar_url, es_principal, permisos, created_at, empresa:empresas(id, nombre, nit, email, telefono)')
        .order('created_at', { ascending: false });
      if (rol) fallbackQuery = fallbackQuery.eq('rol', rol);
      if (activo !== undefined) fallbackQuery = fallbackQuery.eq('activo', activo === 'true');
      const fallbackRes = await fallbackQuery;
      data = (fallbackRes.data || []).map((usuario) => mapPresenceState(usuario));
      error = fallbackRes.error;
    }
  }

  if (error) return res.status(500).json({ error: error.message });
  return res.json((data || []).map((usuario) => mapPresenceState(usuario)));
});

// POST /api/v1/usuarios
router.post('/', verificarToken, checkRole(['admin']), checkAdminPermission('usuarios.create'), async (req, res) => {
  const { nombre_completo, email, password, rol, telefono, identificacion, nit_empresa, nombre_empresa, permisos, es_principal } = req.body;
  if (!nombre_completo || !email || !password || !rol)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  if (!['admin','empresa','repartidor'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });

  const solicitantePuedeGestionarPermisos = adminHasPermission(req.user, 'usuarios.permissions.manage');
  const principalSolicitado = es_principal === true;
  if (principalSolicitado && !req.user.es_principal) {
    return res.status(403).json({ error: 'Solo el administrador principal puede crear otro administrador principal' });
  }
  if (rol === 'admin' && permisos !== undefined && !solicitantePuedeGestionarPermisos) {
    return res.status(403).json({ error: 'No tienes permiso para asignar funciones administrativas' });
  }

  // 1. Validaciones extra por rol
  if (rol === 'empresa' && (!nit_empresa || !nombre_empresa)) {
    return res.status(400).json({ error: 'Para rol empresa se requiere NIT y Nombre de Empresa' });
  }
  if (rol === 'repartidor' && !identificacion) {
    return res.status(400).json({ error: 'Para rol repartidor se requiere la Identificación (Cédula)' });
  }

  // 2. Crear Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(), password, email_confirm: true
  });
  if (authError) return res.status(400).json({ error: authError.message });

  // 3. Crear registro de Empresa si el rol es empresa
  let assigned_empresa_id = null;
  if (rol === 'empresa') {
    const { data: empData, error: empError } = await supabase
      .from('empresas')
      .insert({ nombre: nombre_empresa.trim(), nit: nit_empresa.trim(), email: email.trim().toLowerCase(), telefono: telefono || null })
      .select().single();
    
    if (empError) {
      await supabase.auth.admin.deleteUser(authData.user.id); // Rollback auth
      return res.status(500).json({ error: 'Error creando la empresa: ' + empError.message });
    }
    assigned_empresa_id = empData.id;
  }

  // 4. Crear Perfil de Usuario
  const finalEsPrincipal = rol === 'admin' ? Boolean(principalSolicitado) : false;
  const finalPermisos = rol === 'admin'
    ? sanitizePermisos(permisos, finalEsPrincipal)
    : {};

  const { data: usuario, error: profileError } = await supabase
    .from('usuarios')
    .insert({ 
      id: authData.user.id, 
      nombre_completo: nombre_completo.trim(),
      email: email.trim().toLowerCase(), 
      rol,
      telefono: telefono || null, 
      empresa_id: assigned_empresa_id,
      identificacion: rol === 'repartidor' ? identificacion.trim() : null,
      es_principal: finalEsPrincipal,
      permisos: finalPermisos,
    })
    .select().single();

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    if (assigned_empresa_id) await supabase.from('empresas').delete().eq('id', assigned_empresa_id); // Rollback empresa
    return res.status(500).json({ error: 'Error creando el perfil: ' + profileError.message });
  }
  
  return res.status(201).json({ 
    id: usuario.id,
    nombre_completo: usuario.nombre_completo,
    email: usuario.email,
    rol: usuario.rol,
    es_principal: Boolean(usuario.es_principal),
    permisos: usuario.permisos || {},
  });
});

// PATCH /api/v1/usuarios/:id/estado
router.patch('/:id/estado', verificarToken, checkRole(['admin']), checkAdminPermission('usuarios.edit'), async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean')
    return res.status(400).json({ error: '"activo" debe ser true o false' });
  
  // Update user
  const { data, error } = await supabase
    .from('usuarios').update({ activo }).eq('id', req.params.id)
    .select('id, activo, empresa_id').single();
    
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Sync with empresa table if the user is an empresa
  if (data.empresa_id) {
    const { error: empError } = await supabase
      .from('empresas')
      .update({ activa: activo })
      .eq('id', data.empresa_id);
    if (empError) console.error('Error sincronizando estado de empresa:', empError.message);
  }

  return res.json(data);
});

// POST /api/v1/usuarios/:id/cerrar-sesion
router.post('/:id/cerrar-sesion', verificarToken, checkRole(['admin']), checkAdminPermission('usuarios.edit'), async (req, res) => {
  const { id } = req.params;

  const { data: targetUser, error: fetchError } = await supabase
    .from('usuarios')
    .select('id, rol, nombre_completo')
    .eq('id', id)
    .single();

  if (fetchError || !targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (targetUser.rol !== 'repartidor') {
    return res.status(400).json({ error: 'Solo se puede cerrar sesion remota a cuentas de repartidor' });
  }

  const nowIso = new Date().toISOString();
  const updateRes = await supabase
    .from('usuarios')
    .update({
      current_session_id: null,
      is_online: false,
      last_activity_at: nowIso,
    })
    .eq('id', id)
    .select('id, nombre_completo, rol')
    .single();

  if (updateRes.error) {
    const msg = String(updateRes.error.message || '').toLowerCase();
    if (msg.includes('current_session_id')) {
      const fallback = await supabase
        .from('usuarios')
        .update({
          is_online: false,
          last_activity_at: nowIso,
        })
        .eq('id', id)
        .select('id, nombre_completo, rol')
        .single();
      if (fallback.error) return res.status(500).json({ error: fallback.error.message });
      return res.json({ success: true, message: 'Sesion del repartidor cerrada remotamente', user: fallback.data });
    }
    return res.status(500).json({ error: updateRes.error.message });
  }

  return res.json({ success: true, message: 'Sesion del repartidor cerrada remotamente', user: updateRes.data });
});

// PUT /api/v1/usuarios/:id (Editar usuario)
router.put('/:id', verificarToken, checkRole(['admin']), checkAdminPermission('usuarios.edit'), async (req, res) => {
  const { nombre_completo, telefono, identificacion, permisos, es_principal, email, nombre_empresa, nit_empresa } = req.body;
  if (!nombre_completo) return res.status(400).json({ error: 'Nombre requerido' });

  const { data: usuarioActual, error: fetchError } = await supabase
    .from('usuarios')
    .select('id, rol, es_principal, permisos, empresa_id, email')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !usuarioActual) return res.status(404).json({ error: 'Usuario no encontrado' });

  const quiereEditarPermisos = permisos !== undefined || es_principal !== undefined;
  if (quiereEditarPermisos && !adminHasPermission(req.user, 'usuarios.permissions.manage')) {
    return res.status(403).json({ error: 'No tienes permiso para cambiar funciones administrativas' });
  }

  if (es_principal === false && usuarioActual.id === req.user.id && req.user.es_principal) {
    return res.status(400).json({ error: 'No puedes quitarte el rol de administrador principal a ti mismo' });
  }

  let finalEsPrincipal = Boolean(usuarioActual.es_principal);
  let finalPermisos = usuarioActual.permisos || {};

  if (usuarioActual.rol === 'admin') {
    if (es_principal !== undefined) {
      if (!req.user.es_principal) {
        return res.status(403).json({ error: 'Solo el administrador principal puede cambiar este nivel' });
      }
      finalEsPrincipal = es_principal === true;
    }
    if (permisos !== undefined || es_principal !== undefined) {
      finalPermisos = sanitizePermisos(permisos ?? finalPermisos, finalEsPrincipal);
    }
  }

  let nextEmail = usuarioActual.email;
  if (typeof email === 'string' && email.trim().length > 0) {
    nextEmail = email.trim().toLowerCase();
  }

  if (nextEmail !== usuarioActual.email) {
    const { error: authEmailError } = await supabase.auth.admin.updateUserById(req.params.id, {
      email: nextEmail,
      email_confirm: true,
    });
    if (authEmailError) return res.status(400).json({ error: `No se pudo actualizar el correo en autenticacion: ${authEmailError.message}` });
  }

  if (usuarioActual.rol === 'empresa' && usuarioActual.empresa_id) {
    const empresaUpdate = {};
    if (typeof nombre_empresa === 'string' && nombre_empresa.trim()) empresaUpdate.nombre = nombre_empresa.trim();
    if (typeof nit_empresa === 'string' && nit_empresa.trim()) empresaUpdate.nit = nit_empresa.trim();
    if (typeof telefono === 'string') empresaUpdate.telefono = telefono || null;
    if (nextEmail) empresaUpdate.email = nextEmail;

    if (Object.keys(empresaUpdate).length > 0) {
      const { error: empUpdateError } = await supabase
        .from('empresas')
        .update(empresaUpdate)
        .eq('id', usuarioActual.empresa_id);
      if (empUpdateError) return res.status(500).json({ error: `No se pudo actualizar la empresa: ${empUpdateError.message}` });
    }
  }

  const { data, error } = await supabase
    .from('usuarios')
    .update({ 
      nombre_completo: nombre_completo.trim(), 
      email: nextEmail,
      telefono: telefono || null, 
      identificacion: identificacion ? identificacion.trim() : null,
      es_principal: finalEsPrincipal,
      permisos: finalPermisos,
    })
    .eq('id', req.params.id)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// DELETE /api/v1/usuarios/:id (Eliminar usuario)
router.delete('/:id', verificarToken, checkRole(['admin']), checkAdminPermission('usuarios.delete'), async (req, res) => {
  try {
    const { data: usuario, error: fetchError } = await supabase
        .from('usuarios').select('id, rol, empresa_id').eq('id', req.params.id).single();
    if (fetchError || !usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (usuario.rol === 'admin' && usuario.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario administrador' });
    }

    const [cortesRes, liquidacionesRes, rutasRes] = await Promise.all([
      supabase.from('cortes_caja').select('id', { count: 'exact', head: true }).or(`repartidor_id.eq.${req.params.id},admin_id.eq.${req.params.id}`),
      supabase.from('liquidaciones_repartidor').select('id', { count: 'exact', head: true }).or(`repartidor_id.eq.${req.params.id},creado_por.eq.${req.params.id}`),
      supabase.from('rutas_dia').select('id', { count: 'exact', head: true }).eq('repartidor_id', req.params.id),
    ]);

    const refError = cortesRes.error || liquidacionesRes.error || rutasRes.error;
    if (refError) {
      return res.status(500).json({ error: refError.message });
    }

    const totalReferencias = (cortesRes.count || 0) + (liquidacionesRes.count || 0) + (rutasRes.count || 0);
    if (totalReferencias > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar el usuario porque tiene historial operativo asociado (cortes/liquidaciones/rutas). Desactivalo en lugar de eliminarlo.',
      });
    }

    // Delete auth user via Admin API (which should also cascade delete the usuarios profile)
    const { error: authError } = await supabase.auth.admin.deleteUser(req.params.id);
    if (authError) return res.status(500).json({ error: 'Error al eliminar usuario de auth: ' + authError.message });

    // Fallback manual delete in case cascade is not configured
    await supabase.from('usuarios').delete().eq('id', req.params.id);

    if (usuario.rol === 'empresa' && usuario.empresa_id) {
        await supabase.from('empresas').delete().eq('id', usuario.empresa_id);
    }
    
    return res.json({ success: true, message: 'Usuario eliminado' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/usuarios/:id/avatar (Subir foto)
router.post('/:id/avatar', verificarToken, checkRole(['admin']), checkAdminPermission('usuarios.edit'), upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Foto requerida' });

    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const filePath = `${id}/${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatares')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: publicUrlData } = supabase.storage
      .from('avatares').getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ avatar_url: publicUrl })
      .eq('id', id)
      .select().single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({ avatar_url: publicUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
