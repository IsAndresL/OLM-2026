const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
} else {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
}

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175'
];

app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }, 
  credentials: true 
}));


// Import route modules
const authRoutes = require('./routes/auth');
const empresasRoutes = require('./routes/empresas');
const guiasRoutes = require('./routes/guias');
const etiquetasRoutes = require('./routes/etiquetas');
const usuariosRoutes = require('./routes/usuarios');
const trackingRoutes = require('./routes/tracking');
const repartidorRoutes = require('./routes/repartidor');
const dashboardRoutes = require('./routes/dashboard');
const reportesRoutes = require('./routes/reportes');
const codRoutes = require('./routes/cod');
const liquidacionesRoutes = require('./routes/liquidaciones');
const tarifasRoutes = require('./routes/tarifas');
const gpsRoutes = require('./routes/gps');
const rutasRoutes = require('./routes/rutas');
const zonasRoutes = require('./routes/zonas');
const devolucionesRoutes = require('./routes/devoluciones');

// Register routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/empresas', empresasRoutes);
app.use('/api/v1/guias', guiasRoutes);
app.use('/api/v1/etiquetas', etiquetasRoutes);
app.use('/api/v1/usuarios', usuariosRoutes);
app.use('/api/v1/tracking', trackingRoutes);
app.use('/api/v1/repartidor', repartidorRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/reportes', reportesRoutes);
app.use('/api/v1/cod', codRoutes);
app.use('/api/v1/liquidaciones', liquidacionesRoutes);
app.use('/api/v1/tarifas', tarifasRoutes);
app.use('/api/v1/gps', gpsRoutes);
app.use('/api/v1/rutas', rutasRoutes);
app.use('/api/v1/zonas', zonasRoutes);
app.use('/api/v1/devoluciones', devolucionesRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Backend en http://localhost:${PORT}`));
