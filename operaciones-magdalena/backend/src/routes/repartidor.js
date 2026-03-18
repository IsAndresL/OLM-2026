const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/mis-guias',           verificarToken, checkRole(['repartidor']), (_,res) => res.json({ message: 'Fase 3' }));
router.post('/evidencia/:guia_id', verificarToken, checkRole(['repartidor']), (_,res) => res.json({ message: 'Fase 3' }));
module.exports = router;
