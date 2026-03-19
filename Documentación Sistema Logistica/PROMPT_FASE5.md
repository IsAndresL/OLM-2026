# PROMPT COMPLETO — FASE 5
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# Fase: 5 · Pago contra entrega (COD) + Liquidación de repartidores + Tarifas
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior continuando el desarrollo del sistema
**Operaciones Logísticas del Magdalena**. Las Fases 1–4 están completas:
autenticación, guías, etiquetas PDF, app repartidor, tracking público,
notificaciones WhatsApp, dashboard analítico y reportes Excel.

---

## CONTEXTO DEL PROYECTO

Sistema de gestión logística de última milla en Colombia. El negocio funciona así:
- La empresa recibe paquetes de empresas aliadas (X Cargo, Temu, etc.)
- Los repartidores los entregan puerta a puerta en Santa Marta y alrededores
- Algunos pedidos se pagan al recibir (COD = Cash On Delivery)
- Al fin del día el repartidor debe entregar el dinero del COD a la sede
- La empresa le paga al repartidor por cada guía entregada (tarifa fija)
- La empresa le cobra a la empresa aliada por cada guía gestionada (tarifa diferente)

Esta fase implementa todo el flujo financiero del negocio.

Stack: **React + Vite + Tailwind** (frontend) | **Node.js + Express** (backend)
| **Supabase PostgreSQL** (datos)

---

## ESTRUCTURA EXISTENTE (Fases 1–4 completadas)

```
operaciones-magdalena/
├── backend/src/
│   ├── config/supabase.js          ✅
│   ├── middlewares/auth.js          ✅ verificarToken + checkRole
│   └── routes/
│       ├── auth.js                  ✅
│       ├── guias.js                 ✅ CRUD + estados + historial
│       ├── etiquetas.js             ✅ PDF
│       ├── repartidor.js            ✅ mis-guías + estado + evidencia
│       ├── tracking.js              ✅ portal público
│       ├── usuarios.js              ✅ CRUD
│       ├── empresas.js              ✅ listar
│       ├── dashboard.js             ✅ KPIs + tendencia
│       └── reportes.js              ✅ Excel
└── frontend/src/
    ├── services/api.js              ✅
    ├── components/
    │   ├── Layout.jsx               ✅ sidebar + header
    │   ├── LayoutMovil.jsx          ✅ repartidor
    │   ├── BadgeEstado.jsx          ✅
    │   ├── SkeletonCard.jsx         ✅
    │   └── Alerta.jsx               ✅
    └── pages/
        ├── admin/
        │   ├── AdminDashboard.jsx   ✅
        │   ├── AdminGuias.jsx       ✅
        │   └── AdminUsuarios.jsx    ✅
        ├── empresa/
        │   ├── EmpresaDashboard.jsx ✅
        │   └── EmpresaGuias.jsx     ✅
        └── repartidor/
            └── RepartidorGuias.jsx  ✅
```

---

## NUEVAS TABLAS EN SUPABASE — ejecutar este SQL antes de empezar

```sql
-- ── 1. CONFIGURACIÓN DE TARIFAS ──────────────────────────────────────────────
-- Tarifa que la empresa le paga AL REPARTIDOR por guía entregada
CREATE TABLE tarifas_repartidor (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repartidor_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tarifa_base    DECIMAL(10,2) NOT NULL DEFAULT 3500,  -- pesos COP por guía entregada
  tarifa_novedad DECIMAL(10,2) NOT NULL DEFAULT 500,   -- pesos COP por novedad gestionada
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_tarifa_rep_activa ON tarifas_repartidor(repartidor_id)
  WHERE activa = TRUE;

-- Tarifa que la empresa le cobra A LA EMPRESA ALIADA por guía gestionada
CREATE TABLE tarifas_empresa (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tarifa_base   DECIMAL(10,2) NOT NULL DEFAULT 5000,  -- pesos COP por guía registrada
  tarifa_cod    DECIMAL(10,2) NOT NULL DEFAULT 500,   -- comisión adicional si es COD
  activa        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_tarifa_emp_activa ON tarifas_empresa(empresa_id)
  WHERE activa = TRUE;

-- ── 2. COD — REGISTRO DE COBRO CONTRA ENTREGA ────────────────────────────────
-- Se activa cuando la guía tiene valor_declarado y el cliente debe pagar al recibir
ALTER TABLE guias ADD COLUMN IF NOT EXISTS es_cod         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guias ADD COLUMN IF NOT EXISTS monto_cod      DECIMAL(10,2);  -- cuánto debe cobrar
ALTER TABLE guias ADD COLUMN IF NOT EXISTS cod_cobrado    DECIMAL(10,2);  -- cuánto cobró realmente
ALTER TABLE guias ADD COLUMN IF NOT EXISTS cod_metodo     VARCHAR(20)
  CHECK (cod_metodo IN ('efectivo','transferencia','nequi','daviplata'));
ALTER TABLE guias ADD COLUMN IF NOT EXISTS cod_estado     VARCHAR(20) NOT NULL DEFAULT 'pendiente'
  CHECK (cod_estado IN ('pendiente','cobrado','no_cobrado','entregado_sede'));

-- ── 3. LIQUIDACIONES DE REPARTIDOR ───────────────────────────────────────────
CREATE TABLE liquidaciones_repartidor (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repartidor_id    UUID NOT NULL REFERENCES usuarios(id),
  fecha_desde      DATE NOT NULL,
  fecha_hasta      DATE NOT NULL,
  total_entregadas INT NOT NULL DEFAULT 0,
  total_novedades  INT NOT NULL DEFAULT 0,
  tarifa_base      DECIMAL(10,2) NOT NULL,
  tarifa_novedad   DECIMAL(10,2) NOT NULL DEFAULT 0,
  subtotal_guias   DECIMAL(12,2) NOT NULL,  -- total_entregadas × tarifa_base
  subtotal_novedades DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cod_recaudado DECIMAL(12,2) NOT NULL DEFAULT 0,  -- dinero COD que recibió
  total_cod_entregado DECIMAL(12,2) NOT NULL DEFAULT 0,  -- dinero COD que entregó a sede
  deduccion_cod    DECIMAL(12,2) NOT NULL DEFAULT 0,     -- cod_recaudado - cod_entregado (deuda)
  total_a_pagar    DECIMAL(12,2) NOT NULL,  -- subtotal_guias + subtotal_novedades - deduccion_cod
  estado           VARCHAR(20) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','aprobada','pagada')),
  observaciones    TEXT,
  creado_por       UUID REFERENCES usuarios(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_liq_repartidor ON liquidaciones_repartidor(repartidor_id);

-- Guías incluidas en cada liquidación (relación muchos-a-muchos)
CREATE TABLE liquidacion_guias (
  liquidacion_id  UUID REFERENCES liquidaciones_repartidor(id) ON DELETE CASCADE,
  guia_id         UUID REFERENCES guias(id),
  tipo            VARCHAR(20) CHECK (tipo IN ('entregada','novedad')),
  monto           DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (liquidacion_id, guia_id)
);

-- ── 4. CORTES DE CAJA (entrega de dinero COD a sede) ─────────────────────────
CREATE TABLE cortes_caja (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repartidor_id   UUID NOT NULL REFERENCES usuarios(id),
  monto_declarado DECIMAL(12,2) NOT NULL,  -- lo que dice el repartidor que trae
  monto_recibido  DECIMAL(12,2),           -- lo que el admin verificó
  diferencia      DECIMAL(12,2)
    GENERATED ALWAYS AS (monto_recibido - monto_declarado) STORED,
  estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','verificado','discrepancia')),
  guias_cod       JSONB,                   -- array de guia_ids del corte
  observaciones   TEXT,
  admin_id        UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_corte_repartidor ON cortes_caja(repartidor_id);
```

---

## PASO 1 — BACKEND: `src/routes/cod.js` (archivo nuevo)

### POST /api/v1/cod/guia/:guia_id/activar
```
Rol: admin, empresa
Activa el modo COD en una guía.

Body: { monto_cod: 45000, descripcion?: "Celular Samsung" }

Lógica:
- Verificar que la guía existe y pertenece a la empresa del usuario (si es empresa)
- Solo activar COD si estado = 'registrado' o 'asignado'
- UPDATE guias SET es_cod=true, monto_cod=$monto WHERE id=$guia_id
- Responder: { guia_id, monto_cod, es_cod: true }
```

### POST /api/v1/cod/guia/:guia_id/registrar-cobro
```
Rol: repartidor
El repartidor registra que cobró el COD al entregar.
Solo puede hacerlo sobre sus propias guías.

Body: { cod_cobrado: 45000, cod_metodo: 'efectivo'|'nequi'|'daviplata'|'transferencia' }

Validaciones:
- guia.repartidor_id === req.user.id
- guia.es_cod === true
- guia.estado_actual === 'entregado' (debe marcarse entregado primero)
- cod_cobrado > 0

Lógica:
- UPDATE guias SET cod_cobrado=$monto, cod_metodo=$metodo, cod_estado='cobrado'
- Responder: { guia_id, cod_cobrado, cod_metodo, cod_estado: 'cobrado' }
```

### GET /api/v1/cod/repartidor/pendientes
```
Rol: repartidor
Lista las guías COD pendientes de entregar el dinero a sede.

Respuesta: [
  {
    guia_id, numero_guia, nombre_destinatario,
    monto_cod, cod_cobrado, cod_metodo,
    fecha_entrega: (created_at del historial con estado 'entregado')
  }
]
```

### POST /api/v1/cod/corte-caja
```
Rol: repartidor
El repartidor registra que va a entregar el dinero COD acumulado.

Body: { guia_ids: ["uuid1", "uuid2"], monto_declarado: 135000 }

Lógica:
1. Verificar que todas las guías pertenecen a este repartidor y tienen cod_estado='cobrado'
2. INSERT INTO cortes_caja (repartidor_id, monto_declarado, guias_cod=$array, estado='pendiente')
3. UPDATE guias SET cod_estado='entregado_sede' WHERE id IN ($guia_ids)
4. Responder: { corte_id, monto_declarado, total_guias: N }
```

### GET /api/v1/cod/cortes
```
Rol: admin
Lista todos los cortes de caja pendientes de verificar.

Query: ?estado=pendiente|verificado|discrepancia &repartidor_id=

Respuesta: [{ id, repartidor: {nombre}, monto_declarado, monto_recibido,
              diferencia, estado, total_guias, created_at }]
```

### PATCH /api/v1/cod/cortes/:corte_id/verificar
```
Rol: admin
El admin verifica el dinero que trajo el repartidor.

Body: { monto_recibido: 135000, observaciones?: "Todo correcto" }

Lógica:
- UPDATE cortes_caja SET monto_recibido=$monto, admin_id=req.user.id,
    estado = (monto_recibido === monto_declarado ? 'verificado' : 'discrepancia')
- Responder: { corte_id, diferencia, estado }
```

---

## PASO 2 — BACKEND: `src/routes/liquidaciones.js` (archivo nuevo)

### GET /api/v1/liquidaciones/calcular
```
Rol: admin
Calcula (sin guardar) la liquidación de un repartidor para un período.

Query: ?repartidor_id=uuid &fecha_desde=YYYY-MM-DD &fecha_hasta=YYYY-MM-DD

Lógica:
1. Buscar tarifas_repartidor activa para ese repartidor
   (si no tiene, usar tarifa por defecto: base=3500, novedad=500)
2. Contar guías entregadas en el período (estado_actual='entregado'
   AND historial con estado='entregado' AND created_at BETWEEN fechas)
3. Contar novedades gestionadas (no_contesto + direccion_incorrecta + reagendar
   que luego fueron entregadas o devueltas)
4. Calcular:
   - subtotal_guias = total_entregadas × tarifa_base
   - subtotal_novedades = total_novedades × tarifa_novedad
   - total_cod_recaudado = SUM(cod_cobrado) de guías del repartidor en el período
   - total_cod_entregado = SUM(monto_recibido) de cortes_caja verificados del período
   - deduccion_cod = max(0, total_cod_recaudado - total_cod_entregado)
   - total_a_pagar = subtotal_guias + subtotal_novedades - deduccion_cod

Respuesta:
{
  repartidor: { id, nombre_completo },
  periodo: { desde, hasta },
  tarifa: { base, novedad },
  totales: {
    entregadas: N, novedades: N,
    subtotal_guias, subtotal_novedades,
    total_cod_recaudado, total_cod_entregado, deduccion_cod,
    total_a_pagar
  },
  detalle_guias: [{ numero_guia, nombre_destinatario, tipo:'entregada'|'novedad', monto }]
}
```

### POST /api/v1/liquidaciones
```
Rol: admin
Guarda la liquidación calculada.

Body: { repartidor_id, fecha_desde, fecha_hasta, observaciones? }

Lógica:
1. Llamar a la misma lógica de /calcular internamente
2. INSERT INTO liquidaciones_repartidor con todos los datos calculados
3. INSERT INTO liquidacion_guias por cada guía del detalle
4. Responder: { liquidacion_id, total_a_pagar, estado: 'borrador' }
```

### GET /api/v1/liquidaciones
```
Rol: admin
Listar liquidaciones con filtros.

Query: ?repartidor_id= &estado=borrador|aprobada|pagada &fecha_desde= &fecha_hasta=

Respuesta: [{ id, repartidor:{nombre}, periodo, total_a_pagar, estado, created_at }]
```

### GET /api/v1/liquidaciones/:id
```
Rol: admin
Detalle completo de una liquidación con todas las guías incluidas.
```

### PATCH /api/v1/liquidaciones/:id/estado
```
Rol: admin
Cambiar estado: borrador → aprobada → pagada

Body: { estado: 'aprobada'|'pagada', observaciones? }
Validación: solo avanzar, nunca retroceder (borrador→aprobada→pagada)
```

### GET /api/v1/liquidaciones/:id/pdf
```
Rol: admin
Genera y descarga el recibo de liquidación en PDF.

Formato del PDF (A4):
┌──────────────────────────────────────────────┐
│   OPERACIONES LOGÍSTICAS DEL MAGDALENA       │
│   NIT: 900000001-1                           │
│                                              │
│   LIQUIDACIÓN DE SERVICIOS                  │
│   No. [liquidacion_id corto]                │
│                                              │
│   Repartidor: Juan Carlos Pérez             │
│   Período: 01 al 15 de marzo de 2026        │
│   Fecha emisión: 17/03/2026                 │
│   Estado: APROBADA                          │
│                                              │
│   ─────────────────────────────────────     │
│   Guías entregadas:        38    × $3.500   │
│   Subtotal entregas:                $133.000│
│   Novedades gestionadas:    5    × $500     │
│   Subtotal novedades:               $2.500  │
│   ─────────────────────────────────────     │
│   Total COD recaudado:              $87.000 │
│   Total COD entregado a sede:       $87.000 │
│   Diferencia COD:                   $0      │
│   ─────────────────────────────────────     │
│   TOTAL A PAGAR:                  $135.500  │
│   ─────────────────────────────────────     │
│                                              │
│   Detalle de guías entregadas:              │
│   [tabla con numero_guia, destinatario,     │
│    fecha, monto]                            │
│                                              │
│   _____________________                     │
│   Firma del repartidor                      │
└──────────────────────────────────────────────┘

Usar pdfkit (ya instalado). Formatear montos como pesos colombianos:
  $3.500 (punto como separador de miles, sin centavos)
```

---

## PASO 3 — BACKEND: `src/routes/tarifas.js` (archivo nuevo)

### GET /api/v1/tarifas/repartidores
```
Rol: admin
Lista todos los repartidores con su tarifa actual.

Respuesta: [{
  repartidor: { id, nombre_completo },
  tarifa: { tarifa_base, tarifa_novedad } | null  // null si no tiene tarifa configurada
}]
```

### POST /api/v1/tarifas/repartidores/:repartidor_id
```
Rol: admin
Crear o actualizar tarifa de un repartidor.

Body: { tarifa_base: 3500, tarifa_novedad: 500 }

Lógica:
- Buscar tarifa activa existente
- Si existe: UPDATE con los nuevos valores
- Si no existe: INSERT nueva tarifa activa
- Responder: { repartidor_id, tarifa_base, tarifa_novedad }
```

### GET /api/v1/tarifas/empresas
```
Rol: admin
Lista todas las empresas con su tarifa actual.
```

### POST /api/v1/tarifas/empresas/:empresa_id
```
Rol: admin
Crear o actualizar tarifa de una empresa aliada.

Body: { tarifa_base: 5000, tarifa_cod: 500 }
```

---

## PASO 4 — FRONTEND: nuevas rutas en `App.jsx`

Agregar estas rutas:

```jsx
// Admin
import AdminLiquidaciones    from './pages/admin/AdminLiquidaciones';
import AdminCorteCaja        from './pages/admin/AdminCorteCaja';
import AdminTarifas          from './pages/admin/AdminTarifas';
// Repartidor
import RepartidorCOD         from './pages/repartidor/RepartidorCOD';

// En <Routes>:
<Route path="/admin/liquidaciones"
  element={<PrivateRoute roles={['admin']}><AdminLiquidaciones /></PrivateRoute>} />
<Route path="/admin/caja"
  element={<PrivateRoute roles={['admin']}><AdminCorteCaja /></PrivateRoute>} />
<Route path="/admin/tarifas"
  element={<PrivateRoute roles={['admin']}><AdminTarifas /></PrivateRoute>} />
<Route path="/repartidor/cod"
  element={<PrivateRoute roles={['repartidor']}><RepartidorCOD /></PrivateRoute>} />
```

### Actualizar `Layout.jsx` — agregar items al menú del admin:

```javascript
admin: [
  { to: '/admin/dashboard',      label: 'Dashboard',      icon: 'chart' },
  { to: '/admin/guias',          label: 'Guías',          icon: 'doc' },
  { to: '/admin/usuarios',       label: 'Usuarios',       icon: 'users' },
  { to: '/admin/liquidaciones',  label: 'Liquidaciones',  icon: 'money' },
  { to: '/admin/caja',           label: 'Caja COD',       icon: 'cash' },
  { to: '/admin/tarifas',        label: 'Tarifas',        icon: 'settings' },
],
```

### Actualizar `LayoutMovil.jsx` — agregar enlace al menú del repartidor:
```javascript
repartidor: [
  { to: '/repartidor/guias', label: 'Mis entregas', icon: 'truck' },
  { to: '/repartidor/cod',   label: 'Mi COD',        icon: 'cash' },
],
```

---

## PASO 5 — FRONTEND: páginas del administrador

### `src/pages/admin/AdminTarifas.jsx`

Panel de configuración de tarifas. Dos secciones:

**Sección 1: Tarifas de repartidores**
```
┌─────────────────────────────────────────────────────┐
│ Tarifas de repartidores                [+ Configurar]│
├────────────────────┬──────────────────┬─────────────┤
│ Repartidor         │ Por entregada     │ Por novedad  │
├────────────────────┼──────────────────┼─────────────┤
│ Juan Carlos Pérez  │ $3.500           │ $500    [✏️] │
│ Pedro Martínez     │ Sin tarifa        │ —      [✏️] │
│ María González     │ $4.000           │ $500    [✏️] │
└────────────────────┴──────────────────┴─────────────┘
```
- Botón ✏️ en cada fila abre un modal pequeño con inputs para tarifa_base y tarifa_novedad
- Mostrar "$X.XXX" formateado en pesos colombianos

**Sección 2: Tarifas de empresas aliadas**
```
┌────────────────────┬──────────────────┬─────────────┐
│ Empresa aliada     │ Por guía          │ Comisión COD │
├────────────────────┼──────────────────┼─────────────┤
│ X Cargo S.A.S      │ $4.500           │ $500    [✏️] │
│ Temu Colombia      │ $5.200           │ $800    [✏️] │
└────────────────────┴──────────────────┴─────────────┘
```

**Función de formato de moneda colombiana** (crear en `src/utils/formato.js`):
```javascript
export function formatCOP(monto) {
  if (!monto && monto !== 0) return '—';
  return '$' + Number(monto).toLocaleString('es-CO', { minimumFractionDigits: 0 });
}
// formatCOP(3500) → "$3.500"
// formatCOP(135500) → "$135.500"
```

---

### `src/pages/admin/AdminLiquidaciones.jsx`

Vista principal de liquidaciones:

```
┌─────────────────────────────────────────────────────────────┐
│ Liquidaciones                    [+ Nueva liquidación]       │
├──────────────────────────────────────────────────────────────┤
│ Filtros: [Repartidor ▼] [Estado ▼] [Desde] [Hasta] [Buscar] │
├──────────────────────────────────────────────────────────────┤
│ Repartidor       │ Período          │ Total     │ Estado      │
├──────────────────┼──────────────────┼───────────┼────────────┤
│ Juan C. Pérez    │ 1–15 mar 2026    │ $135.500  │ 🟡 Borrador │
│ Pedro Martínez   │ 1–15 mar 2026    │ $98.000   │ 🟢 Pagada   │
│ María González   │ 1–15 mar 2026    │ $112.000  │ 🔵 Aprobada │
└──────────────────┴──────────────────┴───────────┴────────────┘
```

**Modal "Nueva liquidación"**:
1. Select de repartidor
2. Date pickers: Desde / Hasta
3. Botón "Calcular" → llama a GET /liquidaciones/calcular → muestra preview
4. Preview del cálculo:
   ```
   Guías entregadas:   38   × $3.500 = $133.000
   Novedades:           5   × $500   = $2.500
   COD recaudado:                       $87.000
   COD entregado a sede:                $87.000
   Diferencia COD:                      $0
   ────────────────────────────────────────────
   TOTAL A PAGAR:                     $135.500
   ```
5. Campo observaciones
6. Botón "Guardar liquidación" → POST /liquidaciones
7. Al guardar: cerrar modal y recargar tabla

**Al hacer clic en una fila de la tabla** → abre panel de detalle:
- Datos completos de la liquidación
- Tabla de guías incluidas (numero_guia, destinatario, monto)
- Botones según estado:
  - Si borrador: [Aprobar] [Descargar PDF] [Eliminar]
  - Si aprobada: [Marcar como pagada] [Descargar PDF]
  - Si pagada: [Descargar PDF]

---

### `src/pages/admin/AdminCorteCaja.jsx`

Vista de control de dinero COD:

**Panel superior — resumen del día:**
```
┌──────────────┬──────────────┬───────────────┬────────────────┐
│ En circulación│ Recaudado hoy│ Entregado sede │ Pendiente entrega│
│   $250.000   │  $180.000    │   $135.000    │    $45.000     │
└──────────────┴──────────────┴───────────────┴────────────────┘
```

**Tabla de cortes pendientes de verificar:**
```
┌──────────────────┬──────────────┬──────────────┬───────────────┐
│ Repartidor       │ Guías        │ Monto declarado │ Estado      │
├──────────────────┼──────────────┼────────────────┼────────────┤
│ Juan C. Pérez    │ 8 guías COD  │ $87.000        │ ⏳ Pendiente │
│ Pedro Martínez   │ 5 guías COD  │ $48.000        │ ✅ Verificado│
└──────────────────┴──────────────┴────────────────┴────────────┘
```

**Al hacer clic en "Verificar" en un corte pendiente:**
- Modal con detalle: lista de guías del corte con monto_cod de cada una
- Input: "Monto recibido" (prellenado con monto_declarado)
- Si difieren → mostrar alerta roja "⚠️ Discrepancia de $X.XXX"
- Campo observaciones
- Botón confirmar → PATCH /cod/cortes/:id/verificar

---

## PASO 6 — FRONTEND: página del repartidor (COD)

### `src/pages/repartidor/RepartidorCOD.jsx`

Diseñada para móvil (igual que RepartidorGuias).

**Vista principal:**
```
┌───────────────────────────────────────┐
│  💰 Mi COD pendiente                  │
├───────────────────────────────────────┤
│  Total a entregar en sede:            │
│  ┌──────────────────────────────────┐ │
│  │        $87.000                   │ │
│  │   8 guías COD cobradas           │ │
│  └──────────────────────────────────┘ │
│  [Registrar entrega a sede →]         │
├───────────────────────────────────────┤
│  Detalle de cobros pendientes:        │
│                                       │
│  MAG-0042  Carlos García   $15.000   │
│  Cobrado en: efectivo                 │
│                                       │
│  MAG-0038  Ana López       $22.000   │
│  Cobrado en: nequi                    │
│  ...                                  │
└───────────────────────────────────────┘
```

**Modal "Registrar entrega a sede":**
- Muestra el resumen: "Vas a declarar que entregas $87.000 por 8 guías COD"
- Lista de las guías (checkboxes, por defecto todas marcadas)
- Input "Monto que vas a entregar" (prellenado con el total)
- Botón "Confirmar entrega" → POST /cod/corte-caja
- Mensaje de éxito: "✅ Entrega registrada. El administrador la verificará."

**En `RepartidorGuias.jsx` — integrar registro de COD al entregar:**
Cuando el repartidor marca estado 'entregado' y la guía tiene `es_cod=true`:
- Agregar al modal de estado los campos adicionales:
  ```
  💰 Esta guía requiere cobro COD
  Monto a cobrar: $45.000
  
  ¿Cobró el dinero?
  [✅ Sí, cobré $45.000] → muestra campo de método de pago
  [❌ No pudo cobrar]    → pasa sin registrar COD
  
  Método de pago:
  ○ Efectivo  ○ Nequi  ○ Daviplata  ○ Transferencia
  ```
- Si marcó que cobró → después de hacer el POST de estado, hacer
  POST /cod/guia/:id/registrar-cobro con { cod_cobrado, cod_metodo }

---

## PASO 7 — FRONTEND: actualizar `api.js`

```javascript
// COD
export const codService = {
  activarCOD:       (token, guiaId, data) =>
    req('POST', `/cod/guia/${guiaId}/activar`, data, token),
  registrarCobro:   (token, guiaId, data) =>
    req('POST', `/cod/guia/${guiaId}/registrar-cobro`, data, token),
  pendientesRepartidor: (token) =>
    req('GET', '/cod/repartidor/pendientes', null, token),
  registrarCorte:   (token, data) =>
    req('POST', '/cod/corte-caja', data, token),
  listarCortes:     (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/cod/cortes${qs ? '?'+qs : ''}`, null, token);
  },
  verificarCorte:   (token, corteId, data) =>
    req('PATCH', `/cod/cortes/${corteId}/verificar`, data, token),
};

// Liquidaciones
export const liquidacionesService = {
  calcular:         (token, params) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/liquidaciones/calcular?${qs}`, null, token);
  },
  crear:            (token, data) =>
    req('POST', '/liquidaciones', data, token),
  listar:           (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/liquidaciones${qs ? '?'+qs : ''}`, null, token);
  },
  detalle:          (token, id) =>
    req('GET', `/liquidaciones/${id}`, null, token),
  cambiarEstado:    (token, id, data) =>
    req('PATCH', `/liquidaciones/${id}/estado`, data, token),
  descargarPDF:     (token, id) =>
    fetch(`${BASE}/liquidaciones/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.blob() : Promise.reject(new Error('Error al generar PDF'))),
};

// Tarifas
export const tarifasService = {
  listarRepartidores: (token) =>
    req('GET', '/tarifas/repartidores', null, token),
  guardarRepartidor:  (token, repartidorId, data) =>
    req('POST', `/tarifas/repartidores/${repartidorId}`, data, token),
  listarEmpresas:     (token) =>
    req('GET', '/tarifas/empresas', null, token),
  guardarEmpresa:     (token, empresaId, data) =>
    req('POST', `/tarifas/empresas/${empresaId}`, data, token),
};
```

---

## PASO 8 — REGISTRAR RUTAS EN `backend/src/index.js`

```javascript
app.use('/api/v1/cod',           require('./routes/cod'));
app.use('/api/v1/liquidaciones', require('./routes/liquidaciones'));
app.use('/api/v1/tarifas',       require('./routes/tarifas'));
```

---

## PASO 9 — UTILIDAD: `src/utils/formato.js` (crear archivo)

```javascript
// Formato de moneda colombiana
export function formatCOP(monto) {
  if (monto === null || monto === undefined) return '—';
  return '$' + Number(monto).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// Formato de fecha legible en español
export function formatFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

// Período legible: "1 al 15 de marzo de 2026"
export function formatPeriodo(desde, hasta) {
  const d = new Date(desde);
  const h = new Date(hasta);
  const mes = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  return `${d.getDate()} al ${h.getDate()} de ${mes}`;
}
```

---

## CRITERIOS DE VERIFICACIÓN AL TERMINAR

**Backend:**
1. `POST /cod/guia/:id/activar` agrega es_cod=true y monto_cod a la guía
2. `POST /cod/guia/:id/registrar-cobro` registra el cobro con método de pago
3. `GET /cod/repartidor/pendientes` devuelve solo las guías COD del repartidor autenticado
4. `POST /cod/corte-caja` crea el corte y cambia cod_estado a 'entregado_sede'
5. `GET /liquidaciones/calcular` devuelve el cálculo correcto incluyendo deducción COD
6. `POST /liquidaciones` guarda la liquidación y las guías asociadas
7. `GET /liquidaciones/:id/pdf` descarga un PDF con el recibo formateado en pesos COP
8. `POST /tarifas/repartidores/:id` crea o actualiza la tarifa correctamente

**Frontend:**
9. AdminTarifas muestra la tarifa de cada repartidor y empresa con botón de edición
10. AdminLiquidaciones permite calcular, previsualizar y guardar una liquidación
11. El PDF de liquidación se descarga con montos formateados en pesos colombianos
12. AdminCorteCaja muestra los cortes pendientes y permite verificarlos con diferencia
13. RepartidorCOD muestra el total a entregar y la lista de guías COD cobradas
14. Al marcar "Entregado" en una guía COD, el modal pregunta si cobró y con qué método
15. Los montos aparecen formateados como $X.XXX en toda la interfaz (no $3500 sino $3.500)

---

## INSTRUCCIONES PARA EL MODELO

1. **Ejecutar primero el SQL** de las nuevas tablas en Supabase antes de codear
2. **Crear** `src/routes/cod.js`, `src/routes/liquidaciones.js`, `src/routes/tarifas.js`
3. **Registrar** las nuevas rutas en `index.js`
4. **Crear** `src/utils/formato.js` con las funciones de formateo
5. **Implementar** `AdminTarifas.jsx`, `AdminLiquidaciones.jsx`, `AdminCorteCaja.jsx`
6. **Implementar** `RepartidorCOD.jsx`
7. **Modificar** `RepartidorGuias.jsx` para agregar el flujo de cobro COD
8. **Modificar** `AdminGuias.jsx` para agregar opción "Activar COD" en el formulario
   de nueva guía (checkbox "¿Requiere pago contra entrega?" + campo monto)
9. **Actualizar** `Layout.jsx` con los nuevos items del menú admin
10. **Actualizar** `api.js` con los nuevos servicios
11. Usar **`formatCOP()`** en TODOS los lugares donde se muestra dinero
12. Todos los PDF usan **pdfkit** (ya instalado)
13. Al finalizar mostrar el árbol de archivos nuevos y modificados en esta fase

¡Implementa la Fase 5 completa!
