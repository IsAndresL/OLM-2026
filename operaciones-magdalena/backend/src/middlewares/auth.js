const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');

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
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, email, rol, empresa_id, activo, avatar_url, es_principal, permisos')
      .eq('id', decoded.sub)
      .single();

    if (error || !usuario)  return res.status(401).json({ error: 'Usuario no encontrado' });
    if (!usuario.activo)    return res.status(403).json({ error: 'Usuario desactivado' });
    req.user = {
      ...usuario,
      es_principal: Boolean(usuario.es_principal),
      permisos: normalizeAdminPermissions(usuario.permisos, Boolean(usuario.es_principal)),
    };
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
};
