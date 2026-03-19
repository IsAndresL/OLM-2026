const express  = require('express');
const jwt      = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');
const { verificarToken } = require('../middlewares/auth');
const router = express.Router();

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email y contraseña requeridos' });

  // Use a fresh client for signIn to avoid polluting the shared client's auth context
  const authClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(), password
  });
  if (authError || !authData.user)
    return res.status(401).json({ error: 'Credenciales inválidas' });

  // Use the main service_role client (clean context) to query profile
  const { data: usuario, error: userError } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, email, rol, empresa_id, activo, avatar_url, es_principal, permisos')
    .eq('id', authData.user.id)
    .single();

  if (userError || !usuario)
    return res.status(403).json({ error: 'Usuario sin perfil. Contacta al administrador.' });
  if (!usuario.activo)
    return res.status(403).json({ error: 'Cuenta desactivada' });

  const token = jwt.sign(
    { sub: usuario.id, rol: usuario.rol, empresa_id: usuario.empresa_id },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

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
router.post('/logout', verificarToken, async (_req, res) => {
  return res.json({ message: 'Sesión cerrada' });
});

// GET /api/v1/auth/me
router.get('/me', verificarToken, (req, res) => res.json({ user: req.user }));

module.exports = router;
