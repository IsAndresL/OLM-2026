const express  = require('express');
const jwt      = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const { verificarToken, touchUserActivity } = require('../middlewares/auth');
const router = express.Router();

async function markUserOffline(userId) {
  const { error } = await supabase
    .from('usuarios')
    .update({
      is_online: false,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (!msg.includes('last_activity_at') && !msg.includes('is_online')) {
      throw error;
    }
  }
}

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const rawEmail = String(req.body?.email || '').trim().toLowerCase();
  const rawPassword = String(req.body?.password || '');

  if (!rawEmail || !rawPassword)
    return res.status(400).json({ error: 'Email y contraseña requeridos' });

  if (rawEmail.length > 254 || rawPassword.length > 256) {
    return res.status(400).json({ error: 'Credenciales inválidas' });
  }

  // Use a fresh client for signIn to avoid polluting the shared client's auth context
  const authClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: rawEmail, password: rawPassword
  });
  if (authError || !authData.user) {
    const authMessage = String(authError?.message || '').toLowerCase();

    console.error('[auth/login] Error autenticando en Supabase', {
      email: rawEmail,
      status: authError?.status,
      code: authError?.code,
      message: authError?.message,
    });

    if (authMessage.includes('email not confirmed')) {
      return res.status(401).json({ error: 'Debes confirmar tu correo antes de iniciar sesión' });
    }

    if (authMessage.includes('invalid api key') || authMessage.includes('project not found')) {
      return res.status(500).json({ error: 'Error de configuración de autenticación en el servidor' });
    }

    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  // Use the main service_role client (clean context) to query profile
  const { data: usuario, error: userError } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, email, rol, empresa_id, activo, avatar_url, es_principal, permisos')
    .eq('id', authData.user.id)
    .single();

  if (userError || !usuario)
    return res.status(401).json({ error: 'Acceso no autorizado' });
  if (!usuario.activo)
    return res.status(401).json({ error: 'Acceso no autorizado' });
  if (!['admin', 'empresa', 'repartidor'].includes(usuario.rol))
    return res.status(401).json({ error: 'Acceso no autorizado' });

  const token = jwt.sign(
    { sub: usuario.id, rol: usuario.rol, empresa_id: usuario.empresa_id },
    process.env.JWT_SECRET,
    {
      expiresIn: '8h',
      issuer: process.env.JWT_ISSUER || 'olm-backend',
      audience: process.env.JWT_AUDIENCE || 'olm-app',
    }
  );

  touchUserActivity(usuario.id, { force: true }).catch((err) => {
    console.error('[auth/login] No se pudo marcar usuario online:', err.message);
  });

  return res.json({
    token,
    user: {
      id:              usuario.id,
      nombre_completo: usuario.nombre_completo,
      email:           usuario.email,
      rol:             usuario.rol,
      empresa_id:      usuario.empresa_id,
      avatar_url:      usuario.avatar_url,
      es_principal:    Boolean(usuario.es_principal),
      permisos:        usuario.permisos || {},
    }
  });
});

// POST /api/v1/auth/logout
router.post('/logout', verificarToken, async (req, res) => {
  markUserOffline(req.user.id).catch((err) => {
    console.error('[auth/logout] No se pudo marcar usuario offline:', err.message);
  });
  return res.json({ message: 'Sesión cerrada' });
});

// POST /api/v1/auth/ping
router.post('/ping', verificarToken, async (req, res) => {
  touchUserActivity(req.user.id, { force: true }).catch((err) => {
    console.error('[auth/ping] No se pudo actualizar actividad:', err.message);
  });
  return res.json({ ok: true });
});

// GET /api/v1/auth/me
router.get('/me', verificarToken, (req, res) => res.json({ user: req.user }));

module.exports = router;
