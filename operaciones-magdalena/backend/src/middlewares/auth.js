const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');

const LAST_ACTIVITY_WRITE_MS = 60 * 1000;
const lastActivityWriteCache = new Map();

const ADMIN_PERMISSION_KEYS = [
  'dashboard.view',
  'guias.view',
  'guias.create',
  'guias.edit',
  'guias.assign',
  'guias.delete',
  'reportes.export',
  'etiquetas.generar',
  'usuarios.view',
  'usuarios.create',
  'usuarios.edit',
  'usuarios.delete',
  'usuarios.permissions.manage',
  'liquidaciones.view',
  'liquidaciones.manage',
  'caja_cod.view',
  'caja_cod.manage',
  'tarifas.manage',
  'mapa.view',
  'rutas.manage',
  'zonas.manage',
  'devoluciones.view',
  'devoluciones.manage',
];

function normalizeAdminPermissions(rawPermisos, esPrincipal = false) {
  const normalized = ADMIN_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

  if (rawPermisos && typeof rawPermisos === 'object') {
    ADMIN_PERMISSION_KEYS.forEach((key) => {
      if (rawPermisos[key] === true) normalized[key] = true;
    });
  }

  if (esPrincipal) {
    ADMIN_PERMISSION_KEYS.forEach((key) => {
      normalized[key] = true;
    });
  }

  return normalized;
}

function adminHasPermission(user, permission) {
  if (!user || user.rol !== 'admin') return false;
  if (user.es_principal) return true;
  return Boolean(user.permisos && user.permisos[permission]);
}

function hasMissingColumnError(error, columnName) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes(String(columnName || '').toLowerCase());
}

async function touchUserActivity(userId, { force = false } = {}) {
  const now = Date.now();
  const lastWrite = lastActivityWriteCache.get(userId) || 0;
  if (!force && (now - lastWrite) < LAST_ACTIVITY_WRITE_MS) return;

  lastActivityWriteCache.set(userId, now);

  if (lastActivityWriteCache.size > 500) {
    const maxAge = 24 * 60 * 60 * 1000;
    for (const [cachedUserId, ts] of lastActivityWriteCache.entries()) {
      if ((now - ts) > maxAge) lastActivityWriteCache.delete(cachedUserId);
    }
  }

  const { error } = await supabase
    .from('usuarios')
    .update({
      last_activity_at: new Date(now).toISOString(),
      is_online: true,
    })
    .eq('id', userId);

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (!msg.includes('last_activity_at') && !msg.includes('is_online')) {
      throw error;
    }
  }
}

async function verificarToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token no proporcionado' });

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || 'olm-backend',
      audience: process.env.JWT_AUDIENCE || 'olm-app',
    });

    let sessionColumnsAvailable = true;
    let { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, email, rol, empresa_id, activo, avatar_url, es_principal, permisos, current_session_id')
      .eq('id', decoded.sub)
      .single();

    if (error && hasMissingColumnError(error, 'current_session_id')) {
      sessionColumnsAvailable = false;
      const fallback = await supabase
        .from('usuarios')
        .select('id, nombre_completo, email, rol, empresa_id, activo, avatar_url, es_principal, permisos')
        .eq('id', decoded.sub)
        .single();
      usuario = fallback.data;
      error = fallback.error;
    }

    if (error || !usuario)  return res.status(401).json({ error: 'Usuario no encontrado' });
    if (!usuario.activo)    return res.status(403).json({ error: 'Usuario desactivado' });

    if (sessionColumnsAvailable) {
      const tokenSessionId = typeof decoded.sid === 'string' ? decoded.sid : null;
      const activeSessionId = usuario.current_session_id || null;
      if (!tokenSessionId || !activeSessionId || tokenSessionId !== activeSessionId) {
        return res.status(401).json({
          error: 'Tu sesion fue cerrada porque esta cuenta se inicio en otro dispositivo. Debes iniciar sesion de nuevo para continuar aqui.',
        });
      }
    }

    req.user = {
      ...usuario,
      es_principal: Boolean(usuario.es_principal),
      permisos: normalizeAdminPermissions(usuario.permisos, Boolean(usuario.es_principal)),
    };
    req.auth = decoded;
    touchUserActivity(decoded.sub).catch((err) => {
      console.error('[auth] No se pudo registrar actividad del usuario:', err.message);
    });
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
    return res.status(401).json({ error: msg });
  }
}

function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user)                      return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.rol))  return res.status(403).json({ error: `Requiere rol: ${roles.join(' o ')}` });
    next();
  };
}

function checkAdminPermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.rol !== 'admin') return next();
    if (!adminHasPermission(req.user, permission)) {
      return res.status(403).json({ error: `Permiso requerido: ${permission}` });
    }
    next();
  };
}

module.exports = {
  verificarToken,
  checkRole,
  checkAdminPermission,
  ADMIN_PERMISSION_KEYS,
  normalizeAdminPermissions,
  adminHasPermission,
  touchUserActivity,
};
