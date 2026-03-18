# PROMPT COMPLETO — FASE 1
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# ─────────────────────────────────────────────────────────────
# INSTRUCCIÓN DE USO:
# Pega todo este contenido como prompt inicial a Opus 4.6.
# El modelo construirá la Fase 1 completa paso a paso.
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior. Tu tarea es construir la **Fase 1 completa** del sistema de gestión logística para la empresa **Operaciones Logísticas del Magdalena**.

---

## CONTEXTO DEL PROYECTO

**Operaciones Logísticas del Magdalena** es una empresa de transporte de última milla que distribuye pedidos de empresas aliadas (como X Cargo / Temu) puerta a puerta. Necesitamos un sistema web tipo Servientrega/Interrapidísimo que permita:

- Registrar y gestionar guías de envío
- Generar etiquetas PDF para pegar en los paquetes
- Que los repartidores actualicen el estado de entrega desde el celular
- Que los clientes finales consulten el estado de su pedido (sin login)
- Un dashboard de operaciones para el administrador

El sistema tiene **4 roles**: `admin`, `empresa` (aliada), `repartidor`, `cliente` (público, sin auth).

---

## STACK TECNOLÓGICO

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router v6
- **Backend**: Node.js + Express.js (API REST)
- **Base de datos**: Supabase (PostgreSQL + Auth + Storage)
- **Auth**: Supabase Auth + JWT propio firmado en Express
- **Deploy futuro**: Vercel (frontend) + Railway (backend)

---

## LO QUE DEBES CONSTRUIR EN ESTA FASE 1

### Objetivo de la Fase 1
Tener el proyecto funcionando end-to-end con autenticación completa por roles. Al terminar esta fase, un usuario debe poder hacer login desde el frontend, recibir un JWT, y ser redirigido al panel correcto según su rol (admin → /admin/dashboard, empresa → /empresa/dashboard, repartidor → /repartidor/guias).

---

## PASO 1 — ESTRUCTURA DEL REPOSITORIO

Crea la siguiente estructura de carpetas (monorepo):

```
operaciones-magdalena/
├── .gitignore
├── README.md
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js
│       ├── config/
│       │   └── supabase.js
│       ├── middlewares/
│       │   └── auth.js
│       └── routes/
│           ├── auth.js
│           ├── guias.js         (placeholder Fase 2)
│           ├── etiquetas.js     (placeholder Fase 2)
│           ├── repartidor.js    (placeholder Fase 3)
│           ├── tracking.js      (placeholder Fase 3)
│           ├── dashboard.js     (placeholder Fase 4)
│           ├── reportes.js      (placeholder Fase 4)
│           └── usuarios.js      (CRUD completo en Fase 1)
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── context/
        │   └── AuthContext.jsx
        ├── router/
        │   └── PrivateRoute.jsx
        ├── services/
        │   └── api.js
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── SinAccesoPage.jsx
        │   ├── admin/
        │   │   ├── AdminDashboard.jsx   (placeholder)
        │   │   ├── AdminGuias.jsx       (placeholder)
        │   │   └── AdminUsuarios.jsx    (CRUD básico Fase 1)
        │   ├── empresa/
        │   │   ├── EmpresaDashboard.jsx (placeholder)
        │   │   └── EmpresaGuias.jsx     (placeholder)
        │   ├── repartidor/
        │   │   └── RepartidorGuias.jsx  (placeholder)
        │   └── public/
        │       └── TrackingPage.jsx     (placeholder)
        └── components/
            └── Layout.jsx
```

`.gitignore`:
```
node_modules/
.env
.env.local
dist/
.DS_Store
```

---

## PASO 2 — BASE DE DATOS EN SUPABASE

Genera el siguiente archivo SQL que el desarrollador ejecutará en el **SQL Editor de Supabase**. El archivo debe llamarse `supabase_schema.sql` y quedar en la raíz del proyecto.

```sql
-- Operaciones Logísticas del Magdalena
-- Ejecutar en Supabase → SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. EMPRESAS
CREATE TABLE empresas (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     VARCHAR(255) NOT NULL,
  nit        VARCHAR(20)  UNIQUE,
  email      VARCHAR(255),
  telefono   VARCHAR(20),
  logo_url   TEXT,
  activa     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO empresas (id, nombre, nit, email)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Operaciones Logísticas del Magdalena',
  '900000001-1',
  'ops@magdalenalogistica.com'
);

-- 2. USUARIOS (profiles — id = auth.users.id)
CREATE TABLE usuarios (
  id               UUID PRIMARY KEY,
  nombre_completo  VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL UNIQUE,
  telefono         VARCHAR(20),
  rol              VARCHAR(20) NOT NULL CHECK (rol IN ('admin','empresa','repartidor')),
  empresa_id       UUID REFERENCES empresas(id) ON DELETE SET NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usuarios_rol        ON usuarios(rol);
CREATE INDEX idx_usuarios_empresa_id ON usuarios(empresa_id);

-- 3. GUÍAS
CREATE TABLE guias (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_guia            VARCHAR(30) NOT NULL UNIQUE,
  empresa_id             UUID NOT NULL REFERENCES empresas(id),
  repartidor_id          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  estado_actual          VARCHAR(30) NOT NULL DEFAULT 'registrado'
                           CHECK (estado_actual IN (
                             'registrado','asignado','en_ruta',
                             'entregado','no_contesto',
                             'direccion_incorrecta','reagendar','devuelto'
                           )),
  nombre_remitente       VARCHAR(255) NOT NULL,
  nombre_destinatario    VARCHAR(255) NOT NULL,
  telefono_destinatario  VARCHAR(20)  NOT NULL,
  direccion_destinatario TEXT         NOT NULL,
  ciudad_destino         VARCHAR(100) NOT NULL,
  barrio                 VARCHAR(100),
  descripcion_paquete    TEXT,
  peso_kg                DECIMAL(6,2),
  valor_declarado        DECIMAL(12,2),
  observaciones          TEXT,
  fecha_estimada_entrega DATE,
  etiqueta_pdf_url       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_guias_empresa_id    ON guias(empresa_id);
CREATE INDEX idx_guias_repartidor_id ON guias(repartidor_id);
CREATE INDEX idx_guias_estado_actual ON guias(estado_actual);
CREATE INDEX idx_guias_created_at    ON guias(created_at DESC);
CREATE INDEX idx_guias_numero        ON guias(numero_guia);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guias_updated_at
  BEFORE UPDATE ON guias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. HISTORIAL_ESTADOS
CREATE TABLE historial_estados (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guia_id            UUID NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  estado             VARCHAR(30) NOT NULL,
  nota               TEXT,
  usuario_id         UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  foto_evidencia_url TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_historial_guia_id    ON historial_estados(guia_id);
CREATE INDEX idx_historial_created_at ON historial_estados(created_at DESC);

-- 5. NOTIFICACIONES
CREATE TABLE notificaciones (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guia_id          UUID NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  tipo             VARCHAR(20) NOT NULL CHECK (tipo IN ('whatsapp','sms','email')),
  destinatario_tel VARCHAR(20),
  mensaje          TEXT NOT NULL,
  estado_envio     VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                     CHECK (estado_envio IN ('pendiente','enviado','fallido')),
  enviado_at       TIMESTAMPTZ
);
CREATE INDEX idx_notif_guia_id ON notificaciones(guia_id);

-- 6. FUNCIÓN: número de guía automático (MAG-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION generar_numero_guia()
RETURNS VARCHAR AS $$
DECLARE
  fecha_str VARCHAR(8);
  secuencia INT;
BEGIN
  fecha_str := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO secuencia
  FROM guias WHERE numero_guia LIKE 'MAG-' || fecha_str || '-%';
  RETURN 'MAG-' || fecha_str || '-' || LPAD(secuencia::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 7. ROW LEVEL SECURITY — solo el backend (service_role) accede
ALTER TABLE empresas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE guias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backend_only" ON empresas          USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON usuarios          USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON guias             USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON historial_estados USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON notificaciones    USING (auth.role() = 'service_role');

-- 8. CREAR USUARIO ADMIN (instrucciones):
-- 1) Ve a Supabase → Authentication → Users → Add user
-- 2) Email: admin@magdalenalogistica.com  |  Password: (elige uno seguro)
-- 3) Copia el UUID generado y ejecuta:
-- INSERT INTO usuarios (id, nombre_completo, email, rol, empresa_id)
-- VALUES ('PEGA-UUID-AQUI','Administrador Principal',
--         'admin@magdalenalogistica.com','admin',
--         '00000000-0000-0000-0000-000000000001');
```

---

## PASO 3 — BACKEND (Node.js + Express)

### `backend/package.json`
```json
{
  "name": "magdalena-backend",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "dev": "nodemon src/index.js",
    "start": "node src/index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "pdfkit": "^0.14.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### `backend/.env.example`
```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
JWT_SECRET=genera_uno_con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
WHAPI_TOKEN=
WHAPI_URL=https://gate.whapi.cloud/messages/text
```

### `backend/src/index.js`
```js
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
```

### `backend/src/config/supabase.js`
```js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
module.exports = supabase;
```

### `backend/src/middlewares/auth.js`
```js
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
```

### `backend/src/routes/auth.js`
```js
const express  = require('express');
const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { verificarToken } = require('../middlewares/auth');
const router = express.Router();

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(), password
  });
  if (authError || !authData.user)
    return res.status(401).json({ error: 'Credenciales inválidas' });

  const { data: usuario, error: userError } = await supabase
    .from('usuarios')
    .select('id, nombre_completo, email, rol, empresa_id, activo')
    .eq('id', authData.user.id)
    .single();

  if (userError || !usuario)
    return res.status(403).json({ error: 'Usuario sin perfil. Contacta al administrador.' });
  if (!usuario.activo)
    return res.status(403).json({ error: 'Cuenta desactivada' });

  const token = jwt.sign(
    { sub: usuario.id, rol: usuario.rol, empresa_id: usuario.empresa_id },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({
    token,
    user: {
      id:              usuario.id,
      nombre_completo: usuario.nombre_completo,
      email:           usuario.email,
      rol:             usuario.rol,
      empresa_id:      usuario.empresa_id,
    }
  });
});

// POST /api/v1/auth/logout
router.post('/logout', verificarToken, async (_req, res) => {
  await supabase.auth.signOut();
  return res.json({ message: 'Sesión cerrada' });
});

// GET /api/v1/auth/me
router.get('/me', verificarToken, (req, res) => res.json({ user: req.user }));

module.exports = router;
```

### `backend/src/routes/usuarios.js` (CRUD completo para Fase 1)
```js
const express  = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();

// GET /api/v1/usuarios
router.get('/', verificarToken, checkRole(['admin']), async (req, res) => {
  const { rol, activo } = req.query;
  let query = supabase
    .from('usuarios')
    .select('id, nombre_completo, email, rol, telefono, empresa_id, activo, created_at')
    .order('created_at', { ascending: false });
  if (rol)    query = query.eq('rol', rol);
  if (activo !== undefined) query = query.eq('activo', activo === 'true');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// POST /api/v1/usuarios
router.post('/', verificarToken, checkRole(['admin']), async (req, res) => {
  const { nombre_completo, email, password, rol, telefono, empresa_id } = req.body;
  if (!nombre_completo || !email || !password || !rol)
    return res.status(400).json({ error: 'Faltan: nombre_completo, email, password, rol' });
  if (!['admin','empresa','repartidor'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(), password, email_confirm: true
  });
  if (authError) return res.status(400).json({ error: authError.message });

  const { data: usuario, error: profileError } = await supabase
    .from('usuarios')
    .insert({ id: authData.user.id, nombre_completo: nombre_completo.trim(),
              email: email.trim().toLowerCase(), rol,
              telefono: telefono || null, empresa_id: empresa_id || null })
    .select().single();

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: profileError.message });
  }
  return res.status(201).json({ id: usuario.id, nombre_completo: usuario.nombre_completo,
                                email: usuario.email, rol: usuario.rol });
});

// PATCH /api/v1/usuarios/:id/estado
router.patch('/:id/estado', verificarToken, checkRole(['admin']), async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean')
    return res.status(400).json({ error: '"activo" debe ser true o false' });
  const { data, error } = await supabase
    .from('usuarios').update({ activo }).eq('id', req.params.id)
    .select('id, activo').single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.json(data);
});

module.exports = router;
```

### Rutas placeholder (copiar tal cual, se implementan en fases siguientes)

**`routes/guias.js`**:
```js
const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/',               verificarToken, checkRole(['admin','empresa']),               (_,res) => res.json({ message: 'Fase 2' }));
router.get('/:id',            verificarToken, checkRole(['admin','empresa','repartidor']), (_,res) => res.json({ message: 'Fase 2' }));
router.post('/',              verificarToken, checkRole(['admin','empresa']),               (_,res) => res.json({ message: 'Fase 2' }));
router.post('/bulk',          verificarToken, checkRole(['admin','empresa']),               (_,res) => res.json({ message: 'Fase 2' }));
router.put('/:id',            verificarToken, checkRole(['admin']),                         (_,res) => res.json({ message: 'Fase 2' }));
router.patch('/:id/asignar',  verificarToken, checkRole(['admin']),                         (_,res) => res.json({ message: 'Fase 2' }));
router.post('/:id/estados',   verificarToken, checkRole(['admin','repartidor']),            (_,res) => res.json({ message: 'Fase 3' }));
router.get('/:id/estados',    verificarToken, checkRole(['admin','empresa','repartidor']), (_,res) => res.json({ message: 'Fase 3' }));
module.exports = router;
```

**`routes/etiquetas.js`**:
```js
const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/:guia_id', verificarToken, checkRole(['admin','empresa']), (_,res) => res.json({ message: 'Fase 2' }));
router.post('/bulk',    verificarToken, checkRole(['admin','empresa']), (_,res) => res.json({ message: 'Fase 2' }));
module.exports = router;
```

**`routes/repartidor.js`**:
```js
const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/mis-guias',           verificarToken, checkRole(['repartidor']), (_,res) => res.json({ message: 'Fase 3' }));
router.post('/evidencia/:guia_id', verificarToken, checkRole(['repartidor']), (_,res) => res.json({ message: 'Fase 3' }));
module.exports = router;
```

**`routes/tracking.js`**:
```js
const express   = require('express');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const limiter   = rateLimit({ windowMs: 60000, max: 30 });
router.get('/:numero_guia', limiter, (_,res) => res.json({ message: 'Fase 3' }));
module.exports = router;
```

**`routes/dashboard.js`**:
```js
const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/resumen',   verificarToken, checkRole(['admin']), (_,res) => res.json({ message: 'Fase 4' }));
router.get('/tendencia', verificarToken, checkRole(['admin']), (_,res) => res.json({ message: 'Fase 4' }));
module.exports = router;
```

**`routes/reportes.js`**:
```js
const express = require('express');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();
router.get('/exportar', verificarToken, checkRole(['admin','empresa']), (_,res) => res.json({ message: 'Fase 4' }));
module.exports = router;
```

---

## PASO 4 — FRONTEND (React + Vite + Tailwind)

### Comandos de instalación
```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### `tailwind.config.js`
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

### `src/index.css` (reemplazar contenido)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### `frontend/.env.example`
```
VITE_API_URL=http://localhost:4000/api/v1
```

### `src/context/AuthContext.jsx`
```jsx
import { createContext, useContext, useState, useEffect } from 'react';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
    setLoading(false);
  }, []);

  function login(userData, jwtToken) {
    setUser(userData); setToken(jwtToken);
    localStorage.setItem('token', jwtToken);
    localStorage.setItem('user', JSON.stringify(userData));
  }

  function logout() {
    setUser(null); setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout,
      isAdmin:       user?.rol === 'admin',
      isEmpresa:     user?.rol === 'empresa',
      isRepartidor:  user?.rol === 'repartidor',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe estar dentro de <AuthProvider>');
  return ctx;
}
```

### `src/router/PrivateRoute.jsx`
```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PrivateRoute({ children, roles = [] }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Cargando...</p>
    </div>
  );

  if (!user)                                    return <Navigate to="/login" replace />;
  if (roles.length > 0 && !roles.includes(user.rol)) return <Navigate to="/sin-acceso" replace />;
  return children;
}
```

### `src/services/api.js`
```js
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

async function req(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const cfg = { method, headers };
  if (body) cfg.body = JSON.stringify(body);
  const res  = await fetch(`${BASE}${path}`, cfg);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const authService = {
  login:  (email, password) => req('POST', '/auth/login', { email, password }),
  logout: (token)           => req('POST', '/auth/logout', null, token),
  me:     (token)           => req('GET',  '/auth/me', null, token),
};

export const usuariosService = {
  listar:       (token, params = {}) => { const qs = new URLSearchParams(params).toString(); return req('GET', `/usuarios${qs ? '?'+qs : ''}`, null, token); },
  crear:        (token, data)        => req('POST',  '/usuarios', data, token),
  toggleEstado: (token, id, activo)  => req('PATCH', `/usuarios/${id}/estado`, { activo }, token),
};

export const guiasService = {
  listar:  (token, params = {}) => { const qs = new URLSearchParams(params).toString(); return req('GET', `/guias${qs ? '?'+qs : ''}`, null, token); },
  obtener: (token, id)          => req('GET',   `/guias/${id}`, null, token),
  crear:   (token, data)        => req('POST',  '/guias', data, token),
  editar:  (token, id, data)    => req('PUT',   `/guias/${id}`, data, token),
  asignar: (token, id, repId)   => req('PATCH', `/guias/${id}/asignar`, { repartidor_id: repId }, token),
};

export const repartidorService = {
  misGuias: (token, params = {}) => { const qs = new URLSearchParams(params).toString(); return req('GET', `/repartidor/mis-guias${qs ? '?'+qs : ''}`, null, token); },
};

export const trackingService = {
  consultar: (numeroGuia) => req('GET', `/tracking/${numeroGuia}`),
};

export const dashboardService = {
  resumen:   (token, fecha)   => req('GET', `/dashboard/resumen${fecha ? '?fecha='+fecha : ''}`, null, token),
  tendencia: (token, dias=30) => req('GET', `/dashboard/tendencia?dias=${dias}`, null, token),
};
```

### `src/App.jsx`
```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import PrivateRoute from './router/PrivateRoute';

import LoginPage        from './pages/LoginPage';
import SinAccesoPage    from './pages/SinAccesoPage';
import AdminDashboard   from './pages/admin/AdminDashboard';
import AdminGuias       from './pages/admin/AdminGuias';
import AdminUsuarios    from './pages/admin/AdminUsuarios';
import EmpresaDashboard from './pages/empresa/EmpresaDashboard';
import EmpresaGuias     from './pages/empresa/EmpresaGuias';
import RepartidorGuias  from './pages/repartidor/RepartidorGuias';
import TrackingPage     from './pages/public/TrackingPage';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user)                   return <Navigate to="/login" replace />;
  if (user.rol === 'admin')      return <Navigate to="/admin/dashboard" replace />;
  if (user.rol === 'empresa')    return <Navigate to="/empresa/dashboard" replace />;
  if (user.rol === 'repartidor') return <Navigate to="/repartidor/guias" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"             element={<HomeRedirect />} />
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/sin-acceso"   element={<SinAccesoPage />} />
          <Route path="/rastrear"     element={<TrackingPage />} />
          <Route path="/rastrear/:numero" element={<TrackingPage />} />

          <Route path="/admin/dashboard"
            element={<PrivateRoute roles={['admin']}><AdminDashboard /></PrivateRoute>} />
          <Route path="/admin/guias"
            element={<PrivateRoute roles={['admin']}><AdminGuias /></PrivateRoute>} />
          <Route path="/admin/usuarios"
            element={<PrivateRoute roles={['admin']}><AdminUsuarios /></PrivateRoute>} />

          <Route path="/empresa/dashboard"
            element={<PrivateRoute roles={['empresa']}><EmpresaDashboard /></PrivateRoute>} />
          <Route path="/empresa/guias"
            element={<PrivateRoute roles={['empresa']}><EmpresaGuias /></PrivateRoute>} />

          <Route path="/repartidor/guias"
            element={<PrivateRoute roles={['repartidor']}><RepartidorGuias /></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

### `src/pages/LoginPage.jsx` (página de login completa y funcional)

Construye un login page con Tailwind que tenga:
- Logo / nombre "Operaciones Logísticas del Magdalena" en el encabezado
- Formulario centrado con campos email y password
- Botón "Iniciar sesión" con loading state mientras hace la petición
- Manejo de errores (mostrar mensaje si las credenciales son incorrectas)
- Al hacer login exitoso, llama a `authService.login(email, password)`, guarda el resultado con el `login()` del AuthContext, y navega a `/` (que redirigirá al panel correcto según el rol)
- Diseño profesional con los colores: azul `#1D4ED8` (primario), gris claro de fondo

### `src/pages/SinAccesoPage.jsx`
Página simple que muestre "Acceso denegado" con un botón para volver al inicio.

### `src/components/Layout.jsx`
Layout compartido con:
- Sidebar izquierdo con navegación según el rol del usuario
- Header con nombre del usuario y botón de logout
- Área de contenido principal (`{children}`)
- Admin ve: Dashboard, Guías, Usuarios
- Empresa ve: Dashboard, Guías
- Repartidor ve: Mis entregas
- Usa los colores del sistema: azul `#1D4ED8` para elementos activos

### Páginas placeholder (admin, empresa, repartidor, tracking)
Para cada una crea una página simple que use el `Layout.jsx` y muestre el título de la sección con el mensaje "Esta sección se implementa en la Fase X". Así el sistema de rutas y el layout ya quedan funcionando.

---

## PASO 5 — PRUEBA END-TO-END

Una vez todo esté construido, verifica que:

1. `cd backend && npm install && npm run dev` → servidor en puerto 4000
2. `cd frontend && npm install && npm run dev` → app en puerto 5173
3. Ir a `http://localhost:5173/login`
4. Ingresar las credenciales del admin creado en Supabase
5. Verificar que redirige a `/admin/dashboard`
6. Verificar que el token queda en localStorage
7. Navegar a `/empresa/dashboard` directamente → debe redirigir a `/sin-acceso`
8. Hacer logout → debe redirigir a `/login`

---

## INSTRUCCIONES PARA EL MODELO

1. Crea **todos los archivos** listados arriba con el código completo y funcional
2. Para los archivos que tienen código exacto especificado arriba, úsalo tal cual
3. Para los archivos marcados con descripción (LoginPage, Layout, placeholders), impleméntalos con criterio propio siguiendo las especificaciones dadas
4. Usa Tailwind CSS para todos los estilos — sin CSS módulos, sin styled-components
5. No instales librerías adicionales que no estén en el `package.json` definido
6. Asegúrate de que todos los `import` y `require` sean correctos
7. Al finalizar, muestra el árbol de archivos creados y los comandos para correr el proyecto
8. Si encuentras algún problema de compatibilidad, resuélvelo y documenta la solución

¡Adelante, construye la Fase 1 completa!
