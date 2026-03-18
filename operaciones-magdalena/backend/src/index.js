const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/auth',       require('./routes/auth'));
app.use('/api/v1/guias',      require('./routes/guias'));
app.use('/api/v1/etiquetas',  require('./routes/etiquetas'));
app.use('/api/v1/repartidor', require('./routes/repartidor'));
app.use('/api/v1/tracking',   require('./routes/tracking'));
app.use('/api/v1/dashboard',  require('./routes/dashboard'));
app.use('/api/v1/reportes',   require('./routes/reportes'));
app.use('/api/v1/usuarios',   require('./routes/usuarios'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Backend en http://localhost:${PORT}`));
