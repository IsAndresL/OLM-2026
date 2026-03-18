const express  = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();

// GET /api/v1/usuarios
router.get('/', verificarToken, checkRole(['admin']), async (req, res) => {
  const { rol, activo } = req.query;
  let query = supabase
    .from('usuarios')
    .select('id, nombre_completo, email, rol, telefono, empresa_id, activo, created_at')
    .order('created_at', { ascending: false });
  if (rol)    query = query.eq('rol', rol);
  if (activo !== undefined) query = query.eq('activo', activo === 'true');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// POST /api/v1/usuarios
router.post('/', verificarToken, checkRole(['admin']), async (req, res) => {
  const { nombre_completo, email, password, rol, telefono, empresa_id } = req.body;
  if (!nombre_completo || !email || !password || !rol)
    return res.status(400).json({ error: 'Faltan: nombre_completo, email, password, rol' });
  if (!['admin','empresa','repartidor'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(), password, email_confirm: true
  });
  if (authError) return res.status(400).json({ error: authError.message });

  const { data: usuario, error: profileError } = await supabase
    .from('usuarios')
    .insert({ id: authData.user.id, nombre_completo: nombre_completo.trim(),
              email: email.trim().toLowerCase(), rol,
              telefono: telefono || null, empresa_id: empresa_id || null })
    .select().single();

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: profileError.message });
  }
  return res.status(201).json({ id: usuario.id, nombre_completo: usuario.nombre_completo,
                                email: usuario.email, rol: usuario.rol });
});

// PATCH /api/v1/usuarios/:id/estado
router.patch('/:id/estado', verificarToken, checkRole(['admin']), async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean')
    return res.status(400).json({ error: '"activo" debe ser true o false' });
  const { data, error } = await supabase
    .from('usuarios').update({ activo }).eq('id', req.params.id)
    .select('id, activo').single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.json(data);
});

module.exports = router;
