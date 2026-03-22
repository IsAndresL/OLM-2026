# PROMPT COMPLETO — FASE 7
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# Fase: 7 · API pública REST + API Keys + Webhooks de estado
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior continuando el desarrollo del sistema
**Operaciones Logísticas del Magdalena**. Las Fases 1–6 están completas:
autenticación, guías, etiquetas PDF, app repartidor, tracking público,
notificaciones WhatsApp, dashboard, reportes, COD, liquidaciones, GPS,
rutas optimizadas, zonas y logística inversa.

---

## CONTEXTO DEL NEGOCIO

Las empresas aliadas (X Cargo, Temu, etc.) necesitan integrarse directamente
con el sistema sin usar el panel web. Esta fase expone:

1. **API pública con autenticación por API Key** — las empresas aliadas pueden
   crear guías, consultar estados y descargar etiquetas desde sus propios sistemas.
2. **Webhooks** — cuando cambia el estado de una guía, el sistema notifica
   automáticamente a la URL configurada por la empresa aliada.
3. **Documentación Swagger** — documentación interactiva de la API pública.

Stack: **Node.js + Express** (backend) | **React + Tailwind** (frontend admin)
| **Supabase PostgreSQL** (datos)

---

## ESTRUCTURA EXISTENTE (Fases 1–6 completadas)

```
operaciones-magdalena/
├── backend/src/
│   ├── config/supabase.js            ✅
│   ├── middlewares/auth.js            ✅ JWT para usuarios del panel
│   └── routes/
│       ├── auth.js                    ✅
│       ├── guias.js                   ✅
│       ├── etiquetas.js               ✅
│       ├── repartidor.js              ✅
│       ├── tracking.js                ✅ público
│       ├── usuarios.js                ✅
│       ├── empresas.js                ✅
│       ├── dashboard.js               ✅
│       ├── reportes.js                ✅
│       ├── cod.js                     ✅
│       ├── liquidaciones.js           ✅
│       ├── tarifas.js                 ✅
│       ├── gps.js                     ✅
│       ├── rutas.js                   ✅
│       ├── zonas.js                   ✅
│       └── devoluciones.js            ✅
└── frontend/src/
    ├── services/api.js                ✅
    ├── utils/formato.js               ✅
    └── pages/admin/
        ├── AdminDashboard.jsx         ✅
        ├── AdminGuias.jsx             ✅
        ├── AdminUsuarios.jsx          ✅
        ├── AdminLiquidaciones.jsx     ✅
        ├── AdminCorteCaja.jsx         ✅
        ├── AdminTarifas.jsx           ✅
        ├── AdminMapa.jsx              ✅
        ├── AdminRutas.jsx             ✅
        ├── AdminZonas.jsx             ✅
        └── AdminDevoluciones.jsx      ✅
```

---

## NUEVAS TABLAS EN SUPABASE — ejecutar este SQL antes de empezar

```sql
-- ── 1. API KEYS DE EMPRESAS ALIADAS ───────────────────────────────────────
CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          VARCHAR(100) NOT NULL,
  clave           VARCHAR(64) NOT NULL UNIQUE, -- hash SHA-256 de la key real
  prefijo         VARCHAR(8)  NOT NULL,        -- primeros 8 chars: "olmk_Abc"
  permisos        JSONB NOT NULL DEFAULT '["guias:read","guias:write","tracking:read"]',
  activa          BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_uso      TIMESTAMPTZ,
  peticiones_hoy  INT NOT NULL DEFAULT 0,
  limite_diario   INT NOT NULL DEFAULT 1000,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);
CREATE INDEX idx_apikey_clave   ON api_keys(clave);
CREATE INDEX idx_apikey_empresa ON api_keys(empresa_id);

-- ── 2. LOG DE PETICIONES API ──────────────────────────────────────────────
CREATE TABLE api_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  empresa_id      UUID REFERENCES empresas(id),
  metodo          VARCHAR(10) NOT NULL,
  ruta            VARCHAR(255) NOT NULL,
  status_code     INT NOT NULL,
  duracion_ms     INT,
  ip              VARCHAR(45),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_apilog_key  ON api_logs(api_key_id, created_at DESC);
CREATE INDEX idx_apilog_date ON api_logs(created_at DESC);

-- ── 3. WEBHOOKS ───────────────────────────────────────────────────────────
CREATE TABLE webhooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  secret          VARCHAR(64),
  eventos         JSONB NOT NULL DEFAULT '["estado_cambiado"]',
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_envio    TIMESTAMPTZ,
  ultimo_estado   VARCHAR(20),               -- 'ok' | 'error' | 'timeout'
  fallos_seguidos INT NOT NULL DEFAULT 0,    -- si llega a 5 → desactivar automático
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_webhook_empresa ON webhooks(empresa_id);

-- ── 4. LOG DE WEBHOOKS ────────────────────────────────────────────────────
CREATE TABLE webhook_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  guia_id         UUID REFERENCES guias(id),
  evento          VARCHAR(50) NOT NULL,
  payload         JSONB NOT NULL,
  response_status INT,
  response_body   TEXT,
  duracion_ms     INT,
  exito           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wlog_webhook ON webhook_logs(webhook_id, created_at DESC);
```

---

## VARIABLES DE ENTORNO ADICIONALES

```bash
# backend/.env — agregar:
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=60
WEBHOOK_TIMEOUT_MS=10000
BASE_URL=https://api.magdalenalogistica.com
```

### Dependencias a instalar:

```bash
# Backend
npm install swagger-ui-express swagger-jsdoc node-fetch@2
```

---

## PASO 1 — BACKEND: middleware de API Key

### Crear `src/middlewares/apiKey.js`

```javascript
const crypto   = require('crypto');
const supabase = require('../config/supabase');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function verificarApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'] || req.query.api_key;

  if (!rawKey) {
    return res.status(401).json({
      error: 'API Key requerida',
      hint:  'Incluye el header X-API-Key: olmk_tukey'
    });
  }

  const hash   = hashKey(rawKey);
  const inicio = Date.now();

  const { data: apiKey, error } = await supabase
    .from('api_keys')
    .select('id, empresa_id, nombre, permisos, activa, peticiones_hoy, limite_diario, expires_at')
    .eq('clave', hash)
    .single();

  if (error || !apiKey)
    return res.status(401).json({ error: 'API Key inválida o inexistente' });
  if (!apiKey.activa)
    return res.status(403).json({ error: 'API Key desactivada' });
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date())
    return res.status(403).json({ error: 'API Key expirada' });
  if (apiKey.peticiones_hoy >= apiKey.limite_diario)
    return res.status(429).json({
      error:  'Límite diario de peticiones alcanzado',
      limite: apiKey.limite_diario,
      reset:  'mañana a las 00:00'
    });

  const { data: empresa } = await supabase
    .from('empresas').select('id, nombre').eq('id', apiKey.empresa_id).single();

  req.apiKey  = apiKey;
  req.empresa = empresa;

  // Actualizar uso (sin await — no bloquear)
  supabase.from('api_keys').update({
    ultimo_uso:     new Date().toISOString(),
    peticiones_hoy: apiKey.peticiones_hoy + 1
  }).eq('id', apiKey.id).then(() => {}).catch(() => {});

  // Log de petición (sin await)
  res.on('finish', () => {
    supabase.from('api_logs').insert({
      api_key_id:  apiKey.id,
      empresa_id:  apiKey.empresa_id,
      metodo:      req.method,
      ruta:        req.path,
      status_code: res.statusCode,
      duracion_ms: Date.now() - inicio,
      ip:          req.ip,
    }).then(() => {}).catch(() => {});
  });

  next();
}

function checkPermiso(permiso) {
  return (req, res, next) => {
    if (!req.apiKey?.permisos?.includes(permiso))
      return res.status(403).json({
        error:             `Permiso insuficiente. Se requiere: ${permiso}`,
        permisos_actuales: req.apiKey?.permisos || []
      });
    next();
  };
}

module.exports = { verificarApiKey, checkPermiso, hashKey };
```

---

## PASO 2 — BACKEND: `src/routes/api_publica.js` (archivo nuevo)

Endpoints bajo `/api/public/v1/`. Autenticados con API Key.

### GET /api/public/v1/guias
```
Auth: X-API-Key | Permiso: guias:read
Query: ?estado= &fecha_desde= &fecha_hasta= &page=1 &limit=50
Filtro automático: solo guías de la empresa del apiKey.

Respuesta:
{
  "data": [{
    "numero_guia":     "MAG-20260317-0042",
    "estado":          "en_ruta",
    "destinatario":    { "nombre": "Juan Pérez", "ciudad": "Santa Marta" },
    "fecha_registro":  "2026-03-17T09:15:00Z",
    "fecha_estimada":  "2026-03-18",
    "tracking_url":    "https://magdalenalogistica.com/rastrear/MAG-20260317-0042"
  }],
  "meta": { "total": 145, "page": 1, "limit": 50, "pages": 3 }
}
```

### GET /api/public/v1/guias/:numero_guia
```
Auth: X-API-Key | Permiso: guias:read
Datos completos + historial de estados + tracking_url.
Verificar que la guía pertenece a la empresa del apiKey → 403 si no.
```

### POST /api/public/v1/guias
```
Auth: X-API-Key | Permiso: guias:write
empresa_id = del apiKey (nunca del body).

Body:
{
  "referencia_externa": "ORDER-12345",
  "remitente":          "Tienda XYZ",
  "destinatario": {
    "nombre":    "Juan Pérez",
    "telefono":  "3001234567",
    "direccion": "Cra 15 #45-32",
    "ciudad":    "Santa Marta",
    "barrio":    "El Prado"
  },
  "paquete": {
    "descripcion":     "Ropa deportiva",
    "peso_kg":         0.8,
    "valor_declarado": 85000
  },
  "cod": { "activo": true, "monto": 85000 },
  "fecha_estimada": "2026-03-18"
}

Lógica:
1. Validar campos requeridos: destinatario.nombre, telefono, direccion, ciudad
2. SELECT generar_numero_guia() para obtener el número
3. INSERT en guias con empresa_id del apiKey
4. INSERT en historial_estados: estado='registrado'
5. Si cod.activo=true → activar COD (es_cod=true, monto_cod)
6. Disparar webhook 'guia_creada' (sin await)

Respuesta 201:
{
  "numero_guia":        "MAG-20260317-0042",
  "estado":             "registrado",
  "etiqueta_url":       "https://api.magdalenalogistica.com/api/public/v1/guias/MAG-20260317-0042/etiqueta",
  "tracking_url":       "https://magdalenalogistica.com/rastrear/MAG-20260317-0042",
  "referencia_externa": "ORDER-12345"
}
```

### GET /api/public/v1/guias/:numero_guia/etiqueta
```
Auth: X-API-Key | Permiso: guias:read
Descarga el PDF de la etiqueta reutilizando la lógica de etiquetas.js.
Response: Content-Type: application/pdf
```

### GET /api/public/v1/tracking/:numero_guia
```
Sin autenticación — igual que el tracking público.
Disponible también para sistemas externos sin API key.
```

### GET /api/public/v1/empresas/me
```
Auth: X-API-Key | Permiso: cualquiera

Respuesta:
{
  "empresa":     { "id", "nombre", "nit" },
  "mes_actual":  { "total_guias": 312, "entregadas": 285, "tasa_efectividad": "91.3%" },
  "api_key":     { "nombre": "Integración principal", "peticiones_hoy": 42, "limite_diario": 1000 }
}
```

**Anotar todos los endpoints con JSDoc para Swagger:**
```javascript
/**
 * @swagger
 * /guias:
 *   get:
 *     summary: Listar guías de tu empresa
 *     tags: [Guías]
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [registrado,asignado,en_ruta,entregado,no_contesto,reagendar,devuelto]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 100 }
 *     responses:
 *       200: { description: Lista paginada de guías }
 *       401: { description: API Key inválida o ausente }
 */
```

---

## PASO 3 — BACKEND: `src/routes/api_keys_admin.js` (archivo nuevo)

### GET /api/v1/api-keys
```
Rol: admin — listar todas las API keys con empresa, uso del día y estado.
```

### GET /api/v1/api-keys/empresa/:empresa_id
```
Roles: admin, empresa (solo las propias)
```

### POST /api/v1/api-keys
```
Rol: admin
Body: { empresa_id, nombre, permisos: [...], limite_diario: 1000, expires_at? }

Lógica:
1. Generar: "olmk_" + crypto.randomBytes(24).toString('base64url')
2. Guardar SHA-256(key) en la BD — NUNCA la key en claro
3. Guardar prefijo = primeros 8 chars
4. Responder UNA SOLA VEZ con la key en claro:
{
  "api_key":     "olmk_aB3xKp9mNqR7vLwE2cFhJdUsYgTiZo",
  "prefijo":     "olmk_aB3",
  "nombre":      "Integración principal",
  "advertencia": "Guarda esta clave ahora. No podrás verla de nuevo."
}
```

### PATCH /api/v1/api-keys/:id/estado
```
Rol: admin — Body: { activa: bool }
```

### DELETE /api/v1/api-keys/:id
```
Rol: admin — elimina permanentemente.
```

### GET /api/v1/api-keys/:id/logs
```
Rol: admin
Query: ?fecha_desde= &fecha_hasta= &status_code= &page=1
```

---

## PASO 4 — BACKEND: `src/routes/webhooks.js` (archivo nuevo)

### GET /api/v1/webhooks
```
Roles: admin, empresa (solo los propios)
```

### POST /api/v1/webhooks
```
Roles: admin, empresa
Body: { url, eventos: [...], secret? }

Eventos disponibles:
- "guia_creada"     → nueva guía registrada
- "estado_cambiado" → cualquier cambio de estado
- "entregada"       → solo entregas exitosas
- "novedad"         → no_contesto / dir_incorrecta / reagendar
- "devuelta"        → devuelto al remitente

Al crear: enviar webhook de prueba a la URL.
Respuesta: { id, url, eventos, activo, test_enviado: bool }
```

### PATCH /api/v1/webhooks/:id
```
Actualizar URL, eventos o secret.
```

### DELETE /api/v1/webhooks/:id

### POST /api/v1/webhooks/:id/test
```
Enviar prueba manual: { evento: "test", mensaje: "Webhook de prueba de OLM" }
```

### GET /api/v1/webhooks/:id/logs
```
Últimos 100 intentos de envío con resultado.
```

---

## PASO 5 — BACKEND: Servicio de dispatching de webhooks

### Crear `src/services/webhookDispatcher.js`

```javascript
const crypto   = require('crypto');
const fetch    = require('node-fetch');
const supabase = require('../config/supabase');

const TIMEOUT = parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 10000;

function firmarPayload(secret, payload) {
  if (!secret) return null;
  const ts  = Date.now();
  const sig = crypto.createHmac('sha256', secret)
    .update(`${ts}.${JSON.stringify(payload)}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

async function despacharWebhooks(guia, evento) {
  const { data: hooks } = await supabase
    .from('webhooks')
    .select('id, url, secret, fallos_seguidos')
    .eq('empresa_id', guia.empresa_id)
    .eq('activo', true)
    .contains('eventos', JSON.stringify([evento]));

  if (!hooks?.length) return;

  const payload = {
    evento,
    timestamp: new Date().toISOString(),
    guia: {
      numero_guia:  guia.numero_guia,
      estado:       guia.estado_actual,
      destinatario: {
        nombre:   guia.nombre_destinatario,
        ciudad:   guia.ciudad_destino,
        telefono: guia.telefono_destinatario,
      },
      tracking_url: `${process.env.FRONTEND_URL}/rastrear/${guia.numero_guia}`,
    }
  };

  for (const hook of hooks) {
    const inicio = Date.now();
    let responseStatus = null, responseBody = null, exito = false;

    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent':   'OLM-Webhooks/1.0',
        'X-OLM-Event':  evento,
      };
      const firma = firmarPayload(hook.secret, payload);
      if (firma) headers['X-OLM-Signature'] = firma;

      const response = await fetch(hook.url, {
        method: 'POST', headers,
        body:   JSON.stringify(payload),
        timeout: TIMEOUT,
      });

      responseStatus = response.status;
      responseBody   = await response.text().catch(() => '');
      exito          = response.ok;
    } catch (err) {
      responseBody = err.message;
    }

    const nuevosFallos = exito ? 0 : (hook.fallos_seguidos || 0) + 1;

    // Log del intento (sin await)
    supabase.from('webhook_logs').insert({
      webhook_id: hook.id, guia_id: guia.id, evento, payload,
      response_status: responseStatus,
      response_body:   responseBody?.substring(0, 500),
      duracion_ms:     Date.now() - inicio, exito,
    }).then(() => {}).catch(() => {});

    // Actualizar estado del webhook (sin await)
    supabase.from('webhooks').update({
      ultimo_envio:    new Date().toISOString(),
      ultimo_estado:   exito ? 'ok' : 'error',
      fallos_seguidos: nuevosFallos,
      ...(nuevosFallos >= 5 ? { activo: false } : {}),
    }).eq('id', hook.id).then(() => {}).catch(() => {});
  }
}

module.exports = { despacharWebhooks };
```

### Integrar en `guias.js` y `repartidor.js`

En cada punto donde cambia el estado de una guía:

```javascript
const { despacharWebhooks } = require('../services/webhookDispatcher');

// Determinar evento según el nuevo estado:
const evento = nuevoEstado === 'entregado'  ? 'entregada'
             : nuevoEstado === 'devuelto'   ? 'devuelta'
             : ['no_contesto','direccion_incorrecta','reagendar']
                 .includes(nuevoEstado)      ? 'novedad'
             : 'estado_cambiado';

despacharWebhooks(guia, evento); // sin await — best-effort, nunca bloquear
```

También disparar al crear guía en `POST /api/v1/guias`:
```javascript
despacharWebhooks(nuevaGuia, 'guia_creada');
```

---

## PASO 6 — BACKEND: Swagger y rate limiting

### Crear `src/config/swagger.js`

```javascript
const swaggerJsdoc = require('swagger-jsdoc');

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Operaciones Logísticas del Magdalena — API',
      version:     '1.0.0',
      description: `
API REST para integrar tu sistema con OLM.
Crea guías, consulta estados y recibe notificaciones por webhook.

## Autenticación
\`\`\`
X-API-Key: olmk_tuApiKey
\`\`\`
Obtén tu API Key en el panel → Integraciones → API Keys.

## Rate Limiting
60 peticiones/min · hasta 1.000 diarias por API Key.

## Errores
Formato: \`{ "error": "descripción" }\`
      `,
      contact: { name: 'Soporte OLM', email: 'api@magdalenalogistica.com' },
    },
    servers: [
      { url: `${process.env.BASE_URL}/api/public/v1`, description: 'Producción' },
      { url: 'http://localhost:4000/api/public/v1',   description: 'Desarrollo' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
      }
    },
    security: [{ ApiKeyAuth: [] }],
  },
  apis: ['./src/routes/api_publica.js'],
});
```

### Crear `src/middlewares/rateLimitApi.js`

```javascript
const rateLimit = require('express-rate-limit');

module.exports = rateLimit({
  windowMs:     parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 60000,
  max:          parseInt(process.env.API_RATE_LIMIT_MAX)        || 60,
  message:      { error: 'Demasiadas peticiones. Intenta en un minuto.' },
  headers:      true,
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
});
```

### Registrar en `index.js`:

```javascript
const rateLimitApi = require('./middlewares/rateLimitApi');
const swaggerUi    = require('swagger-ui-express');
const swaggerSpec  = require('./config/swagger');

// API pública
app.use('/api/public/v1', rateLimitApi, require('./routes/api_publica'));

// Gestión de API keys y webhooks (panel admin)
app.use('/api/v1/api-keys', require('./routes/api_keys_admin'));
app.use('/api/v1/webhooks', require('./routes/webhooks'));

// Documentación Swagger
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'OLM API Docs',
  customCss: '.swagger-ui .topbar { background: #1D4ED8; }',
}));
app.get('/docs/spec.json', (_req, res) => res.json(swaggerSpec));
```

---

## PASO 7 — FRONTEND: `src/pages/admin/AdminApiKeys.jsx`

```
┌───────────────────────────────────────────────────────────────┐
│ API Keys                                    [+ Nueva API Key] │
├──────────────────┬────────────────────┬──────────┬───────────┤
│ Empresa          │ Nombre             │ Uso hoy  │ Estado     │
│ X Cargo S.A.S   │ Integración princ. │ 42/1.000 │ Activa [...] │
│ Temu Colombia    │ Producción         │  0/1.000 │ Activa [...] │
└──────────────────┴────────────────────┴──────────┴───────────┘
```

**Modal "Nueva API Key":**
1. Select empresa
2. Input nombre
3. Checkboxes de permisos: [✅ Leer guías] [✅ Crear guías] [✅ Tracking]
4. Input límite diario (default 1.000)
5. Date picker expiración (opcional)
6. Botón "Generar API Key"

**Modal especial al generar — UNA SOLA VEZ:**
```
┌──────────────────────────────────────────────────────────────┐
│  ⚠️  GUARDA ESTA CLAVE AHORA                                 │
│      No podrás verla de nuevo.                               │
│                                                              │
│  olmk_aB3xKp9mNqR7vLwE2cFhJdUsYgTiZo4PwE8                  │
│                                       [📋 Copiar]            │
│                                                              │
│  [✅ Ya la guardé, cerrar]                                   │
└──────────────────────────────────────────────────────────────┘
```
El botón "Cerrar" solo se habilita después de hacer clic en "Copiar"
o de esperar 5 segundos (para que el usuario no lo cierre sin leer).

**Menú de acciones por fila ([...]):**
- Ver logs: tabla con método, ruta, status HTTP, duración, timestamp
- Activar / Desactivar
- Eliminar (confirmación: "¿Eliminar definitivamente? Las peticiones con esta key fallarán.")

---

## PASO 8 — FRONTEND: `src/pages/admin/AdminWebhooks.jsx`

```
┌──────────────────────────────────────────────────────────────┐
│ Webhooks                                   [+ Nuevo webhook] │
├──────────────────┬──────────────────┬──────────┬────────────┤
│ Empresa          │ URL              │ Estado   │ Último envío│
│ X Cargo          │ https://x.co/... │ ✅ OK    │ hace 2 min  │
│ Temu Colombia    │ https://t.co/... │ ❌ Error │ hace 1h     │
└──────────────────┴──────────────────┴──────────┴────────────┘
```

**Panel de detalle (al hacer clic en una fila):**
- URL completa
- Eventos configurados (badges de colores: uno por evento)
- Botón "Enviar prueba" → `POST /api/v1/webhooks/:id/test`
  → feedback inmediato: "✅ 200 OK (134ms)" o "❌ Error: ECONNREFUSED"
- Historial de últimos 20 intentos:
  tabla con fecha, evento, status HTTP, duración ms, ✅/❌
  Si hay error: mostrar `response_body` en bloque de código gris

**Modal "Nuevo webhook":**
1. Input URL (validar que empiece con https://)
2. Checkboxes eventos:
   [✅ Cualquier cambio de estado]
   [☐ Solo entregadas]
   [☐ Solo novedades]
   [☐ Solo devoluciones]
   [☐ Guía creada]
3. Input secret (opcional, placeholder: "dejar vacío si no necesitas verificar firma")
4. Botón "Guardar y probar"
5. Feedback: "✅ Webhook guardado. Prueba enviada correctamente."
   o "⚠️ Webhook guardado, pero la URL no respondió 2XX."

---

## PASO 9 — FRONTEND: actualizar `Layout.jsx` y `App.jsx`

```javascript
// Agregar al menú admin:
{ to: '/admin/api-keys', label: 'API Keys', icon: 'key'     },
{ to: '/admin/webhooks', label: 'Webhooks', icon: 'webhook' },
// Enlace externo a la documentación Swagger:
// Al hacer clic → abrir /docs en nueva pestaña
```

```jsx
// App.jsx:
import AdminApiKeys  from './pages/admin/AdminApiKeys';
import AdminWebhooks from './pages/admin/AdminWebhooks';

<Route path="/admin/api-keys"
  element={<PrivateRoute roles={['admin']}><AdminApiKeys /></PrivateRoute>} />
<Route path="/admin/webhooks"
  element={<PrivateRoute roles={['admin']}><AdminWebhooks /></PrivateRoute>} />
```

---

## PASO 10 — FRONTEND: actualizar `api.js`

```javascript
export const apiKeysService = {
  listar:        (token) => req('GET', '/api-keys', null, token),
  listarEmpresa: (token, empresaId) =>
    req('GET', `/api-keys/empresa/${empresaId}`, null, token),
  crear:         (token, data) => req('POST', '/api-keys', data, token),
  toggleEstado:  (token, id, activa) =>
    req('PATCH', `/api-keys/${id}/estado`, { activa }, token),
  eliminar:      (token, id) => req('DELETE', `/api-keys/${id}`, null, token),
  logs:          (token, id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/api-keys/${id}/logs${qs ? '?'+qs : ''}`, null, token);
  },
};

export const webhooksService = {
  listar:     (token) => req('GET', '/webhooks', null, token),
  crear:      (token, data) => req('POST', '/webhooks', data, token),
  actualizar: (token, id, data) => req('PATCH', `/webhooks/${id}`, data, token),
  eliminar:   (token, id) => req('DELETE', `/webhooks/${id}`, null, token),
  test:       (token, id) => req('POST', `/webhooks/${id}/test`, null, token),
  logs:       (token, id) => req('GET', `/webhooks/${id}/logs`, null, token),
};
```

---

## CRITERIOS DE VERIFICACIÓN AL TERMINAR

**API pública:**
1. `GET /api/public/v1/guias` con `X-API-Key: olmk_...` devuelve solo las
   guías de esa empresa, con paginación correcta
2. `POST /api/public/v1/guias` crea la guía y devuelve `numero_guia` + `etiqueta_url`
3. Sin API Key → 401. Key de empresa A consultando → solo ve guías de A.
4. Al superar el límite diario → 429 con mensaje claro
5. `GET /docs` muestra la documentación Swagger interactiva en el navegador
6. El JSON de la spec está disponible en `GET /docs/spec.json`

**API Keys (admin):**
7. Crear una API Key → modal muestra la clave completa UNA SOLA VEZ con botón copiar
8. El botón "cerrar" se habilita solo después de copiar o 5 segundos
9. Desactivar una key → peticiones con esa key devuelven 403
10. Los logs muestran historial de peticiones con método, ruta y status

**Webhooks:**
11. Crear webhook → se envía test automático y se muestra el resultado
12. Cambiar el estado de una guía → la URL configurada recibe el payload JSON
    con `X-OLM-Signature` si tiene secret configurado
13. Después de 5 fallos seguidos → el webhook se desactiva automáticamente
14. El historial de logs muestra status HTTP y `response_body` de cada intento

---

## INSTRUCCIONES PARA EL MODELO

1. **Ejecutar el SQL** en Supabase (4 tablas: api_keys, api_logs, webhooks,
   webhook_logs)
2. **Instalar** `swagger-ui-express swagger-jsdoc node-fetch@2` en backend
3. **Crear** `src/middlewares/apiKey.js` y `src/middlewares/rateLimitApi.js`
4. **Crear** `src/services/webhookDispatcher.js`
5. **Integrar** `despacharWebhooks()` en `guias.js` y `repartidor.js` en todos
   los puntos donde cambia el estado (siempre sin `await`)
6. **Crear** `src/routes/api_publica.js` con JSDoc en cada endpoint
7. **Crear** `src/routes/api_keys_admin.js` y `src/routes/webhooks.js`
8. **Crear** `src/config/swagger.js` y montarlo en `index.js`
9. **Implementar** `AdminApiKeys.jsx` y `AdminWebhooks.jsx`
10. **Actualizar** `Layout.jsx`, `App.jsx` y `api.js`
11. **CRÍTICO de seguridad**: la API Key NUNCA se guarda en claro en la BD.
    Solo el hash SHA-256. La clave real se muestra UNA SOLA VEZ.
12. **CRÍTICO**: `despacharWebhooks()` siempre sin `await`. Nunca bloquear la
    respuesta HTTP del sistema por un webhook.
13. Al finalizar mostrar el árbol de archivos nuevos y modificados.

¡Implementa la Fase 7 completa!
