const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/exportar', verificarToken, checkRole(['admin','empresa']), (_,res) => res.json({ message: 'Fase 4' }));
module.exports = router;
