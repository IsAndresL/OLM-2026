const express  = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');
const router = express.Router();

// GET /api/v1/empresas — listar empresas activas
router.get('/', verificarToken, checkRole(['admin']), checkAdminPermission('guias.view'), async (req, res) => {
  const { data: usuariosEmpresaActivos, error: usuariosError } = await supabase
    .from('usuarios')
    .select('empresa_id')
    .eq('rol', 'empresa')
    .eq('activo', true)
    .not('empresa_id', 'is', null);

  if (usuariosError) return res.status(500).json({ error: usuariosError.message });

  const empresaIds = [...new Set((usuariosEmpresaActivos || []).map((u) => u.empresa_id).filter(Boolean))];
  if (empresaIds.length === 0) return res.json([]);

  const { data, error } = await supabase
    .from('empresas')
    .select('id, nombre, nit')
    .eq('activa', true)
    .in('id', empresaIds)
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

module.exports = router;
