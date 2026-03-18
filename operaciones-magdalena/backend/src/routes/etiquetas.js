const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/:guia_id', verificarToken, checkRole(['admin','empresa']), (_,res) => res.json({ message: 'Fase 2' }));
router.post('/bulk',    verificarToken, checkRole(['admin','empresa']), (_,res) => res.json({ message: 'Fase 2' }));
module.exports = router;
