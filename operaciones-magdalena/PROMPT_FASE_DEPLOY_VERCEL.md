# PROMPT COMPLETO — FASE: DEPLOY A PRODUCCIÓN EN VERCEL
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# Objetivo: Desplegar frontend + backend en Vercel (100% gratuito)
#            y migrar el GPS a Supabase Realtime (eliminar dependencia del backend)
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior. Tu tarea es preparar el proyecto
**Operaciones Logísticas del Magdalena** para producción, desplegando tanto
el frontend como el backend en **Vercel** de forma completamente gratuita,
y migrando el sistema GPS para usar **Supabase Realtime** directamente
desde el frontend (eliminando los endpoints GPS del backend).

---

## CONTEXTO

El proyecto tiene esta estructura (monorepo):

```
operaciones-magdalena/
├── frontend/   → React + Vite + Tailwind
└── backend/    → Node.js + Express
```

**Por qué Vercel para ambos:**
- El frontend en Vercel es nativo (SPA React).
- El backend Express se despliega como Serverless Functions en Vercel.
- El GPS se saca del backend y va directo a Supabase Realtime para evitar
  los problemas de cold starts con conexiones persistentes.
- Todo gratis en el plan Hobby de Vercel.

---

## PARTE 1 — MIGRACIÓN GPS A SUPABASE REALTIME

Esta es la modificación más importante. El repartidor ya no llama al backend
para enviar su ubicación: escribe directamente a Supabase desde el frontend.
El admin ya no hace polling: recibe las actualizaciones por WebSocket.

### PASO 1.1 — SQL en Supabase: políticas RLS para ubicaciones

Ejecutar en el SQL Editor de Supabase:

```sql
-- Habilitar RLS (si no está habilitado ya desde la Fase 6)
ALTER TABLE ubicaciones_repartidor  ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_ubicaciones   ENABLE ROW LEVEL SECURITY;

-- El repartidor autenticado puede leer y escribir SU PROPIA ubicación
CREATE POLICY "repartidor_gestiona_ubicacion"
ON ubicaciones_repartidor
FOR ALL
TO authenticated
USING     (auth.uid() = repartidor_id)
WITH CHECK (auth.uid() = repartidor_id);

-- El admin puede leer TODAS las ubicaciones
CREATE POLICY "admin_lee_todas_ubicaciones"
ON ubicaciones_repartidor
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND rol = 'admin'
  )
);

-- El repartidor puede insertar su historial
CREATE POLICY "repartidor_inserta_historial_ubi"
ON historial_ubicaciones
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = repartidor_id);

-- El admin puede leer el historial completo
CREATE POLICY "admin_lee_historial_ubicaciones"
ON historial_ubicaciones
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND rol = 'admin'
  )
);

-- Habilitar Realtime en la tabla de ubicaciones
-- (También se puede hacer en Supabase → Database → Replication)
ALTER PUBLICATION supabase_realtime ADD TABLE ubicaciones_repartidor;
```

### PASO 1.2 — Crear `frontend/src/config/supabaseClient.js`

El frontend necesita su propio cliente Supabase con la **anon key**
(nunca la service role key). Este cliente se usa para el GPS y Realtime.

```javascript
// frontend/src/config/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnon);
```

### PASO 1.3 — Instalar Supabase en el frontend

```bash
cd frontend
npm install @supabase/supabase-js
```

### PASO 1.4 — Modificar `frontend/src/pages/repartidor/RepartidorGuias.jsx`

Reemplazar el bloque de GPS que llamaba al backend (`gpsService.actualizarUbicacion`)
por escritura directa a Supabase:

```javascript
// ELIMINAR import de gpsService (o dejar las otras funciones si las usa)
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';

// Dentro del componente, en el useEffect de GPS:
useEffect(() => {
  if (!navigator.geolocation) return;

  const enviarUbicacion = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;

        // Escribir directamente a Supabase (sin pasar por Express)
        await supabase.from('ubicaciones_repartidor').upsert({
          repartidor_id: user.id,
          lat,
          lng,
          precision_m:  Math.round(accuracy),
          activo:        true,
          updated_at:    new Date().toISOString(),
        }, { onConflict: 'repartidor_id' });

        // También guardar en historial (para la ruta del día)
        await supabase.from('historial_ubicaciones').insert({
          repartidor_id: user.id,
          lat,
          lng,
        });
      },
      (err) => {
        // GPS denegado o no disponible — continuar sin él, nunca bloquear la UI
        console.warn('[GPS] No disponible:', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  };

  enviarUbicacion();                              // inmediato al montar
  const intervalo = setInterval(enviarUbicacion, 30000); // cada 30s

  return () => {
    clearInterval(intervalo);
    // Al desmontar (logout): marcar como inactivo
    supabase.from('ubicaciones_repartidor')
      .update({ activo: false })
      .eq('repartidor_id', user.id)
      .then(() => {})
      .catch(() => {});
  };
}, [user.id]);
```

### PASO 1.5 — Modificar `frontend/src/pages/admin/AdminMapa.jsx`

Reemplazar el polling (`setInterval` llamando a `GET /api/v1/gps/repartidores`)
por una suscripción a Supabase Realtime:

```javascript
import { supabase } from '../../config/supabaseClient';

// Dentro del componente:
useEffect(() => {
  // 1. Carga inicial de todas las ubicaciones activas
  const cargarUbicaciones = async () => {
    const { data } = await supabase
      .from('ubicaciones_repartidor')
      .select(`
        repartidor_id, lat, lng, precision_m, activo, updated_at,
        usuarios!inner ( nombre_completo )
      `)
      .eq('activo', true);

    if (data) {
      const mapa = {};
      data.forEach(u => { mapa[u.repartidor_id] = u; });
      setUbicaciones(mapa);
    }
  };

  cargarUbicaciones();

  // 2. Suscripción Realtime — se actualiza solo sin polling
  const canal = supabase
    .channel('gps-en-vivo')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ubicaciones_repartidor' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          setUbicaciones(prev => {
            const nuevo = { ...prev };
            delete nuevo[payload.old.repartidor_id];
            return nuevo;
          });
        } else {
          setUbicaciones(prev => ({
            ...prev,
            [payload.new.repartidor_id]: payload.new,
          }));
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(canal);
}, []);
```

### PASO 1.6 — Modificar `frontend/src/pages/public/TrackingPage.jsx`

Actualizar el polling de ubicación del repartidor para usar Supabase directamente:

```javascript
import { supabase } from '../../config/supabaseClient';

// Dentro del componente, cuando estado === 'en_ruta':
useEffect(() => {
  if (guia?.estado_actual !== 'en_ruta' || !guia?.repartidor_id) return;

  const canal = supabase
    .channel(`tracking-${guia.repartidor_id}`)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'ubicaciones_repartidor',
        filter: `repartidor_id=eq.${guia.repartidor_id}`,
      },
      (payload) => {
        setUbicacionRepartidor({
          lat: payload.new.lat,
          lng: payload.new.lng,
        });
      }
    )
    .subscribe();

  return () => supabase.removeChannel(canal);
}, [guia?.estado_actual, guia?.repartidor_id]);
```

### PASO 1.7 — Actualizar `frontend/.env.example`

```bash
VITE_API_URL=http://localhost:4000/api/v1
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...  # anon key (NO la service_role key)
```

### PASO 1.8 — Eliminar o dejar como stubs los endpoints GPS del backend

En `backend/src/routes/gps.js`, los endpoints `PUT /ubicacion` y
`DELETE /ubicacion` ya no son necesarios. Puedes:
- Eliminarlos completamente, o
- Dejarlos como stubs que devuelven `{ ok: true }` sin hacer nada
  (por si alguna versión vieja del frontend aún los llama)

Los endpoints de lectura admin (`GET /repartidores`, `GET /:id/historial`)
**sí se mantienen** en el backend por si se necesitan desde la API interna.

---

## PARTE 2 — CONFIGURAR VERCEL PARA EL BACKEND (Express como Serverless)

### PASO 2.1 — Crear `backend/vercel.json`

Este archivo le dice a Vercel cómo convertir Express en serverless functions:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.js"
    }
  ]
}
```

### PASO 2.2 — Ajustar `backend/src/index.js` para Vercel

Vercel no usa `app.listen()` — exporta el app como módulo. Ajustar el final del archivo:

```javascript
// Reemplazar el bloque final de index.js:

const PORT = process.env.PORT || 4000;

// Desarrollo local: levantar el servidor normalmente
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Backend en http://localhost:${PORT}`);
    console.log(`   Env: ${process.env.NODE_ENV}`);
  });
}

// Producción (Vercel serverless): exportar el app
module.exports = app;
```

### PASO 2.3 — Ajustar CORS en `backend/src/index.js` para producción

```javascript
// Reemplazar la configuración de CORS:
app.use(cors({
  origin: (origin, callback) => {
    // En desarrollo: permitir localhost
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // En producción: solo el dominio del frontend en Vercel
    const permitidos = [
      process.env.FRONTEND_URL,
      // Agregar preview URLs de Vercel (para PRs y previews)
      /\.vercel\.app$/,
    ];
    const esPermitido = !origin || permitidos.some(p =>
      typeof p === 'string' ? p === origin : p.test(origin)
    );
    callback(esPermitido ? null : new Error('CORS no permitido'), esPermitido);
  },
  credentials: true,
}));
```

### PASO 2.4 — Crear `backend/.env.example` actualizado

```bash
# ── Supabase ─────────────────────────────────────────────────
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # NUNCA al frontend

# ── JWT ──────────────────────────────────────────────────────
JWT_SECRET=genera_con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ── Servidor ─────────────────────────────────────────────────
PORT=4000
NODE_ENV=development   # cambiar a 'production' en Vercel

# ── CORS ─────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173   # en Vercel: https://tu-app.vercel.app

# ── WhatsApp ─────────────────────────────────────────────────
WHAPI_TOKEN=
WHAPI_URL=https://gate.whapi.cloud/messages/text

# ── Google Maps (opcional) ───────────────────────────────────
GOOGLE_MAPS_API_KEY=

# ── API pública ───────────────────────────────────────────────
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=60
WEBHOOK_TIMEOUT_MS=10000
BASE_URL=https://tu-backend.vercel.app
```

### PASO 2.5 — Verificar `backend/package.json`

Asegurarse de que tenga el script `start` y que las dependencias estén en
`dependencies` (no en `devDependencies`), porque Vercel instala solo
`dependencies` en producción:

```json
{
  "scripts": {
    "dev":   "nodemon src/index.js",
    "start": "node src/index.js"
  }
}
```

`nodemon` debe estar en `devDependencies`, todo lo demás en `dependencies`.

---

## PARTE 3 — CONFIGURAR VERCEL PARA EL FRONTEND

### PASO 3.1 — Crear `frontend/public/_redirects`

Para que React Router funcione correctamente en Vercel (todas las rutas
deben servir `index.html`):

```
/*    /index.html   200
```

### PASO 3.2 — Crear `frontend/vercel.json`

```json
{
  "rewrites": [
    { "source": "/((?!api/.*).*)", "destination": "/index.html" }
  ]
}
```

### PASO 3.3 — Actualizar `frontend/vite.config.js` para producción

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server:  { port: 5173 },
  build: {
    outDir:    'dist',
    sourcemap: false,          // no sourcemaps en producción
    rollupOptions: {
      output: {
        // Code splitting: separar vendor de la app
        manualChunks: {
          vendor:  ['react', 'react-dom', 'react-router-dom'],
          charts:  ['recharts'],
          leaflet: ['leaflet', 'react-leaflet'],
          supabase:['@supabase/supabase-js'],
        }
      }
    },
    // Avisar si algún chunk supera 500KB
    chunkSizeWarningLimit: 500,
  }
});
```

### PASO 3.4 — Actualizar `frontend/.env.example`

```bash
VITE_API_URL=http://localhost:4000/api/v1
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## PARTE 4 — ESTRUCTURA FINAL DEL REPOSITORIO

### PASO 4.1 — Crear `.gitignore` en la raíz del monorepo

```
# Dependencias
node_modules/
*/node_modules/

# Variables de entorno — NUNCA commitear
.env
.env.local
.env.production
*/.env
*/.env.local
*/.env.production

# Build
dist/
build/
.next/

# Sistema
.DS_Store
*.log
npm-debug.log*

# Vercel
.vercel/
```

### PASO 4.2 — Actualizar `README.md` con instrucciones de deploy

```markdown
# Operaciones Logísticas del Magdalena

## Deploy en Vercel (gratuito)

### Pre-requisitos
- Cuenta en [Vercel](https://vercel.com) (gratuita)
- Proyecto en [Supabase](https://supabase.com) con el schema ejecutado
- Repositorio en GitHub

---

### 1. Ejecutar el SQL en Supabase
En Supabase → SQL Editor, ejecutar en orden:
1. `supabase_schema.sql` (schema base)
2. Las adiciones de cada fase (Fase 5, 6, 7 si aplica)
3. Las políticas RLS del GPS (ver PARTE 1 de la Fase Deploy)

### 2. Crear usuario admin
En Supabase → Authentication → Users → Add user:
- Email: admin@magdalenalogistica.com
- Password: (elige uno seguro)
- Copiar el UUID generado y ejecutar:
```sql
INSERT INTO usuarios (id, nombre_completo, email, rol, empresa_id)
VALUES (
  'UUID-DEL-ADMIN',
  'Administrador Principal',
  'admin@magdalenalogistica.com',
  'admin',
  '00000000-0000-0000-0000-000000000001'
);
```

### 3. Deploy del backend en Vercel
1. Ir a [vercel.com/new](https://vercel.com/new)
2. Importar el repositorio de GitHub
3. **Root Directory**: `backend`
4. **Framework Preset**: Other
5. **Build Command**: (dejar vacío)
6. **Output Directory**: (dejar vacío)
7. **Install Command**: `npm install`
8. Agregar variables de entorno (ver `backend/.env.example`)
9. Deploy → anotar la URL: `https://magdalena-backend.vercel.app`

### 4. Deploy del frontend en Vercel
1. Crear otro proyecto en Vercel desde el mismo repo
2. **Root Directory**: `frontend`
3. **Framework Preset**: Vite
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. Agregar variables de entorno:
   - `VITE_API_URL` = `https://magdalena-backend.vercel.app/api/v1`
   - `VITE_SUPABASE_URL` = URL de tu proyecto Supabase
   - `VITE_SUPABASE_ANON_KEY` = anon key de Supabase
7. Deploy → anotar la URL: `https://magdalena.vercel.app`

### 5. Actualizar FRONTEND_URL en el backend
En Vercel → backend project → Settings → Environment Variables:
- `FRONTEND_URL` = `https://magdalena.vercel.app`
- Hacer Redeploy para aplicar el cambio

### 6. Habilitar Realtime en Supabase
En Supabase → Database → Replication:
- Activar "Realtime" para la tabla `ubicaciones_repartidor`

---

## Variables de entorno requeridas

### Backend (Vercel)
| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (NUNCA al frontend) |
| `JWT_SECRET` | Clave secreta para JWT (mín. 64 chars) |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | URL del frontend en Vercel |
| `WHAPI_TOKEN` | Token de Whapi.cloud (opcional) |
| `WHAPI_URL` | URL de Whapi.cloud |
| `BASE_URL` | URL del backend en Vercel |

### Frontend (Vercel)
| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL del backend + `/api/v1` |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key (pública, segura para el frontend) |

---

## Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env   # completar con tus credenciales
npm install
npm run dev            # http://localhost:4000

# Frontend (en otra terminal)
cd frontend
cp .env.example .env   # completar con tus credenciales
npm install
npm run dev            # http://localhost:5173
```
```

---

## PARTE 5 — CHECKLIST DE VERIFICACIÓN PRE-DEPLOY

### PASO 5.1 — Crear `scripts/check-deploy.js` en la raíz

Script que verifica que todo está listo antes de hacer deploy:

```javascript
// scripts/check-deploy.js
// Ejecutar con: node scripts/check-deploy.js
const fs   = require('fs');
const path = require('path');

const checks = [];

function check(nombre, condicion, ayuda) {
  const ok = typeof condicion === 'function' ? condicion() : condicion;
  checks.push({ nombre, ok, ayuda });
}

// ── Archivos requeridos ──────────────────────────────────────
check('backend/vercel.json existe',
  () => fs.existsSync('backend/vercel.json'),
  'Crear backend/vercel.json con la configuración de serverless');

check('frontend/vercel.json existe',
  () => fs.existsSync('frontend/vercel.json'),
  'Crear frontend/vercel.json con rewrites para SPA');

check('frontend/public/_redirects existe',
  () => fs.existsSync('frontend/public/_redirects'),
  'Crear con contenido: /*    /index.html   200');

check('backend/.env.example existe',
  () => fs.existsSync('backend/.env.example'),
  'Crear backend/.env.example con todas las variables');

check('frontend/.env.example existe',
  () => fs.existsSync('frontend/.env.example'),
  'Crear frontend/.env.example con VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');

// ── .env NO commiteado ───────────────────────────────────────
check('backend/.env NO en el repo',
  () => !fs.existsSync('backend/.env') ||
        fs.readFileSync('.gitignore','utf8').includes('.env'),
  '¡CRÍTICO! Nunca commitear .env. Verificar .gitignore');

// ── package.json del backend ─────────────────────────────────
const pkgBack = JSON.parse(fs.readFileSync('backend/package.json', 'utf8'));
check('backend tiene script "start"',
  () => !!pkgBack.scripts?.start,
  'Agregar "start": "node src/index.js" en scripts');

check('nodemon está en devDependencies',
  () => !!pkgBack.devDependencies?.nodemon,
  'Mover nodemon de dependencies a devDependencies');

// ── module.exports en index.js ───────────────────────────────
const indexContent = fs.readFileSync('backend/src/index.js', 'utf8');
check('backend exporta app (module.exports = app)',
  () => indexContent.includes('module.exports = app'),
  'Agregar module.exports = app al final de index.js');

// ── Frontend config ──────────────────────────────────────────
const viteConfig = fs.readFileSync('frontend/vite.config.js', 'utf8');
check('vite.config.js tiene configuración de build',
  () => viteConfig.includes('rollupOptions'),
  'Actualizar vite.config.js con manualChunks para code splitting');

const pkgFront = JSON.parse(fs.readFileSync('frontend/package.json', 'utf8'));
check('@supabase/supabase-js en frontend',
  () => !!pkgFront.dependencies?.['@supabase/supabase-js'],
  'npm install @supabase/supabase-js en el frontend');

// ── Resultado ────────────────────────────────────────────────
console.log('\n🔍 Verificación pre-deploy\n');
let fallos = 0;
checks.forEach(({ nombre, ok, ayuda }) => {
  console.log(`${ok ? '✅' : '❌'} ${nombre}`);
  if (!ok) { console.log(`   → ${ayuda}`); fallos++; }
});

console.log(`\n${fallos === 0
  ? '✅ Todo listo para deploy en Vercel!'
  : `❌ ${fallos} problema(s) a resolver antes del deploy.`
}\n`);

process.exit(fallos > 0 ? 1 : 0);
```

Agregar al `package.json` de la raíz:
```json
{
  "scripts": {
    "check-deploy": "node scripts/check-deploy.js"
  }
}
```

---

## CRITERIOS DE VERIFICACIÓN AL TERMINAR

**GPS con Supabase Realtime:**
1. El repartidor abre la app → el GPS se activa y escribe en `ubicaciones_repartidor`
   **sin** llamar al backend Express
2. El AdminMapa se actualiza en tiempo real cuando el repartidor se mueve,
   **sin** hacer polling cada 30s
3. Al cerrar sesión el repartidor → su registro en `ubicaciones_repartidor`
   se marca como `activo=false`
4. El TrackingPage muestra la ubicación del repartidor en tiempo real
   cuando el estado es `en_ruta`

**Backend en Vercel:**
5. `GET https://tu-backend.vercel.app/health` responde `{ status: "ok" }`
6. `POST https://tu-backend.vercel.app/api/v1/auth/login` funciona correctamente
7. El CORS permite peticiones desde el dominio del frontend en Vercel
8. Las variables de entorno están configuradas en Vercel (no en el código)

**Frontend en Vercel:**
9. `https://tu-app.vercel.app/login` carga correctamente
10. Navegar directamente a `https://tu-app.vercel.app/admin/guias` no da 404
    (el `_redirects` está funcionando)
11. `npm run build` en el frontend no produce errores ni warnings críticos
12. Los chunks del build están separados (vendor, charts, leaflet, supabase)

**Checklist script:**
13. `node scripts/check-deploy.js` pasa todos los checks con ✅

---

## INSTRUCCIONES PARA EL MODELO

1. **Ejecutar el SQL** de las políticas RLS del GPS en Supabase
2. **Crear** `frontend/src/config/supabaseClient.js`
3. **Instalar** `@supabase/supabase-js` en el frontend
4. **Modificar** `RepartidorGuias.jsx`: reemplazar el GPS del backend por
   escritura directa a Supabase
5. **Modificar** `AdminMapa.jsx`: reemplazar el polling por Supabase Realtime
6. **Modificar** `TrackingPage.jsx`: suscribirse a Realtime para el mapa del cliente
7. **Modificar** `backend/src/routes/gps.js`: vaciar o eliminar los endpoints
   `PUT /ubicacion` y `DELETE /ubicacion` (los de lectura se pueden mantener)
8. **Crear** `backend/vercel.json`
9. **Modificar** `backend/src/index.js`:
   - Agregar `module.exports = app` al final
   - Ajustar el bloque de `app.listen()` con la condición `NODE_ENV !== 'production'`
   - Actualizar la configuración de CORS para producción
10. **Crear** `frontend/vercel.json`
11. **Crear** `frontend/public/_redirects`
12. **Actualizar** `frontend/vite.config.js` con code splitting
13. **Actualizar** ambos `.env.example` con las nuevas variables
14. **Crear** `scripts/check-deploy.js` en la raíz
15. **Actualizar** `README.md` con las instrucciones completas de deploy
16. **Verificar** que `nodemon` está en `devDependencies` del backend
17. Al finalizar: ejecutar `node scripts/check-deploy.js` y mostrar el resultado.
    Si hay fallos, corregirlos antes de terminar.

¡Prepara el proyecto para producción en Vercel!
