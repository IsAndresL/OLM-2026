const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');

async function verificarToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token no proporcionado' });

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, email, rol, empresa_id, activo')
      .eq('id', decoded.sub)
      .single();

    if (error || !usuario)  return res.status(401).json({ error: 'Usuario no encontrado' });
    if (!usuario.activo)    return res.status(403).json({ error: 'Usuario desactivado' });
    req.user = usuario;
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

module.exports = { verificarToken, checkRole };
