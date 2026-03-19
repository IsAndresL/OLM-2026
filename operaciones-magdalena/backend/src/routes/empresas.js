const express  = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');
const router = express.Router();

// GET /api/v1/empresas — listar empresas activas
router.get('/', verificarToken, checkRole(['admin']), checkAdminPermission('guias.view'), async (req, res) => {
  const { data, error } = await supabase
    .from('empresas')
    .select('id, nombre, nit')
    .eq('activa', true)
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

module.exports = router;
