const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const limiter   = rateLimit({ windowMs: 60000, max: 30 });
router.get('/:numero_guia', limiter, (_,res) => res.json({ message: 'Fase 3' }));
module.exports = router;
