const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/resumen',   verificarToken, checkRole(['admin']), (_,res) => res.json({ message: 'Fase 4' }));
router.get('/tendencia', verificarToken, checkRole(['admin']), (_,res) => res.json({ message: 'Fase 4' }));
module.exports = router;
