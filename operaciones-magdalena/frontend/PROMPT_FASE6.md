# PROMPT COMPLETO — FASE 6
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# Fase: 6 · GPS en tiempo real + Optimización de rutas + Logística inversa
#         + Zonas de reparto + Firma digital del receptor
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior continuando el desarrollo del sistema
**Operaciones Logísticas del Magdalena**. Las Fases 1–5 están completas:
autenticación, guías, etiquetas PDF, app repartidor, tracking público,
notificaciones WhatsApp, dashboard, reportes Excel, COD y liquidaciones.

---

## CONTEXTO DEL PROYECTO

Sistema de gestión logística de última milla en Santa Marta, Colombia.
Esta fase agrega las capacidades de campo: los repartidores comparten su
ubicación en tiempo real, el admin ve en un mapa dónde está cada uno,
el cliente ve al repartidor moverse hacia su dirección, y el sistema
sugiere el orden óptimo de entregas para cada repartidor.

Stack: **React + Vite + Tailwind** (frontend) | **Node.js + Express** (backend)
| **Supabase PostgreSQL + Realtime** (datos + websockets)
| **Google Maps API** (mapas y geocoding)

---

## ESTRUCTURA EXISTENTE (Fases 1–5 completadas)

```
operaciones-magdalena/
├── backend/src/
│   ├── config/supabase.js           ✅
│   ├── middlewares/auth.js           ✅
│   └── routes/
│       ├── auth.js                   ✅
│       ├── guias.js                  ✅
│       ├── etiquetas.js              ✅
│       ├── repartidor.js             ✅
│       ├── tracking.js               ✅
│       ├── usuarios.js               ✅
│       ├── empresas.js               ✅
│       ├── dashboard.js              ✅
│       ├── reportes.js               ✅
│       ├── cod.js                    ✅
│       ├── liquidaciones.js          ✅
│       └── tarifas.js                ✅
└── frontend/src/
    ├── services/api.js               ✅
    ├── utils/formato.js              ✅
    ├── components/
    │   ├── Layout.jsx                ✅
    │   ├── LayoutMovil.jsx           ✅
    │   ├── BadgeEstado.jsx           ✅
    │   ├── SkeletonCard.jsx          ✅
    │   └── Alerta.jsx                ✅
    └── pages/
        ├── admin/
        │   ├── AdminDashboard.jsx    ✅
        │   ├── AdminGuias.jsx        ✅
        │   ├── AdminUsuarios.jsx     ✅
        │   ├── AdminLiquidaciones.jsx ✅
        │   ├── AdminCorteCaja.jsx    ✅
        │   └── AdminTarifas.jsx      ✅
        ├── empresa/
        │   ├── EmpresaDashboard.jsx  ✅
        │   └── EmpresaGuias.jsx      ✅
        └── repartidor/
            ├── RepartidorGuias.jsx   ✅
            └── RepartidorCOD.jsx     ✅
```

---

## NUEVAS TABLAS EN SUPABASE — ejecutar este SQL antes de empezar

```sql
-- ── 1. UBICACIONES GPS EN TIEMPO REAL ─────────────────────────────────────
-- Guarda la última posición conocida de cada repartidor activo
CREATE TABLE ubicaciones_repartidor (
  repartidor_id  UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  lat            DECIMAL(10, 7) NOT NULL,
  lng            DECIMAL(10, 7) NOT NULL,
  precision_m    INT,                        -- precisión del GPS en metros
  activo         BOOLEAN NOT NULL DEFAULT TRUE,  -- está en turno activo
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historial de ubicaciones (para reconstruir ruta del día)
CREATE TABLE historial_ubicaciones (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repartidor_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lat            DECIMAL(10, 7) NOT NULL,
  lng            DECIMAL(10, 7) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_hist_ubi_rep ON historial_ubicaciones(repartidor_id, created_at DESC);

-- ── 2. ZONAS DE REPARTO ────────────────────────────────────────────────────
CREATE TABLE zonas (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre         VARCHAR(100) NOT NULL,      -- "Norte", "Centro", "Sur", "Rodadero"
  descripcion    TEXT,
  color          VARCHAR(7) NOT NULL DEFAULT '#1D4ED8',  -- hex para el mapa
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Barrios/sectores que pertenecen a cada zona
CREATE TABLE zonas_barrios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zona_id     UUID NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
  barrio      VARCHAR(100) NOT NULL,   -- nombre del barrio
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (zona_id, barrio)
);

-- Repartidores asignados a zonas (uno puede tener varias)
CREATE TABLE zonas_repartidores (
  zona_id        UUID NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
  repartidor_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (zona_id, repartidor_id)
);

-- Agregar columna zona_id a guias para asignación automática
ALTER TABLE guias ADD COLUMN IF NOT EXISTS zona_id UUID REFERENCES zonas(id) ON DELETE SET NULL;
CREATE INDEX idx_guias_zona ON guias(zona_id);

-- ── 3. RUTAS OPTIMIZADAS ──────────────────────────────────────────────────
CREATE TABLE rutas_dia (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repartidor_id   UUID NOT NULL REFERENCES usuarios(id),
  fecha           DATE NOT NULL,
  orden_guias     JSONB NOT NULL,   -- array ordenado de guia_ids
  distancia_km    DECIMAL(8,2),     -- distancia total estimada
  tiempo_min      INT,              -- tiempo estimado en minutos
  estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','en_progreso','completada')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repartidor_id, fecha)
);

-- ── 4. FIRMAS DIGITALES ───────────────────────────────────────────────────
-- La firma se sube a Supabase Storage, aquí solo se guarda la URL
ALTER TABLE historial_estados
  ADD COLUMN IF NOT EXISTS firma_url TEXT,
  ADD COLUMN IF NOT EXISTS nombre_receptor VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cedula_receptor VARCHAR(20);

-- ── 5. LOGÍSTICA INVERSA (DEVOLUCIONES) ──────────────────────────────────
CREATE TABLE devoluciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guia_id         UUID NOT NULL REFERENCES guias(id),
  guia_retorno_id UUID REFERENCES guias(id),   -- guía de retorno al remitente
  motivo          VARCHAR(50) NOT NULL
    CHECK (motivo IN (
      'no_contesto','direccion_incorrecta','rechazo_cliente',
      'paquete_danado','direccion_no_existe','otro'
    )),
  descripcion     TEXT,
  estado          VARCHAR(30) NOT NULL DEFAULT 'en_bodega'
    CHECK (estado IN ('en_bodega','en_retorno','devuelto_remitente','descartado')),
  repartidor_id   UUID REFERENCES usuarios(id),
  admin_id        UUID REFERENCES usuarios(id),
  foto_paquete_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dev_guia ON devoluciones(guia_id);

-- Datos iniciales de zonas para Santa Marta
INSERT INTO zonas (id, nombre, descripcion, color) VALUES
  (uuid_generate_v4(), 'Norte',    'Taganga, Bello Horizonte, El Rodadero Norte',    '#1D4ED8'),
  (uuid_generate_v4(), 'Centro',   'Centro histórico, El Prado, Los Almendros',     '#059669'),
  (uuid_generate_v4(), 'Sur',      'Bastidas, La Paz, Villa del Río, Los Alpes',    '#D97706'),
  (uuid_generate_v4(), 'Rodadero', 'Rodadero, Gaira, Pozos Colorados',              '#DC2626'),
  (uuid_generate_v4(), 'Mamatoco', 'Mamatoco, Cristo Rey, Villa Universitaria',     '#7C3AED');
```

---

## VARIABLES DE ENTORNO ADICIONALES

```bash
# backend/.env — agregar:
GOOGLE_MAPS_API_KEY=AIzaSy...   # necesario para geocoding y rutas

# frontend/.env — agregar:
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...  # necesario para renderizar el mapa
```

**Nota importante sobre Google Maps API:**
El modelo debe configurar el sistema para que funcione con y sin la API key.
Si `GOOGLE_MAPS_API_KEY` no está configurada, el sistema usa **OpenStreetMap +
Leaflet** como fallback gratuito. Toda la lógica de mapas debe abstraerse en
componentes reutilizables que soporten ambos proveedores.

### Dependencias a instalar:

```bash
# Backend
npm install @googlemaps/google-maps-services-js

# Frontend
npm install leaflet react-leaflet
# (Leaflet es el fallback gratuito; Google Maps se carga vía script tag si hay API key)
```

---

## PASO 1 — BACKEND: `src/routes/gps.js` (archivo nuevo)

### PUT /api/v1/gps/ubicacion
```
Rol: repartidor
El repartidor envía su ubicación desde la app cada 30 segundos.

Body: { lat: 11.2408, lng: -74.1990, precision_m: 12 }

Lógica:
1. UPSERT en ubicaciones_repartidor (actualiza si ya existe, inserta si no)
2. INSERT en historial_ubicaciones (registro histórico)
3. Limitar historial: borrar entradas > 24 horas para no acumular basura
4. Responder: { ok: true }

IMPORTANTE: Este endpoint debe ser ultra-rápido. Sin JOINs, sin lógica extra.
```

### DELETE /api/v1/gps/ubicacion
```
Rol: repartidor
El repartidor termina su turno y desactiva su ubicación.

Lógica:
- UPDATE ubicaciones_repartidor SET activo=false WHERE repartidor_id=req.user.id
- Responder: { ok: true }
```

### GET /api/v1/gps/repartidores
```
Rol: admin
Devuelve la última ubicación de todos los repartidores activos.

Respuesta:
[{
  repartidor_id, nombre_completo,
  lat, lng, precision_m, updated_at,
  guias_activas: N,   -- guías en_ruta asignadas al repartidor hoy
  ultimo_estado_hace: "5 min"  // tiempo desde el último ping GPS
}]
```

### GET /api/v1/gps/repartidor/:id/ubicacion
```
Sin autenticación (público — para el tracking del cliente)
Devuelve SOLO la ubicación actual si el repartidor está activo.

Nota de seguridad: NO devolver nombre ni datos del repartidor.
Solo: { lat, lng, activo } o 404 si no está activo.

Esta ruta es llamada por el portal de tracking cuando la guía está en estado
'en_ruta', para mostrar el punto en el mapa al cliente.
```

### GET /api/v1/gps/repartidor/:id/historial
```
Rol: admin
Historial de ubicaciones del día para dibujar la ruta recorrida en el mapa.

Query: ?fecha=YYYY-MM-DD (default: hoy)
Respuesta: [{ lat, lng, created_at }]  -- ordenado ASC
```

---

## PASO 2 — BACKEND: `src/routes/rutas.js` (archivo nuevo)

### POST /api/v1/rutas/optimizar
```
Rol: admin
Calcula el orden óptimo de entrega para un repartidor.

Body: {
  repartidor_id: "uuid",
  fecha: "YYYY-MM-DD",       // default: hoy
  origen: { lat, lng }       // punto de inicio (bodega/sede)
}

Lógica:
1. Obtener todas las guías asignadas al repartidor en esa fecha
   (estado en: asignado, en_ruta, no_contesto, reagendar)
2. Geocodificar cada dirección si no tiene coordenadas guardadas
   (usar Google Maps Geocoding API si está disponible, o devolver en orden
   de registro como fallback)
3. Si Google Maps disponible: calcular ruta optimizada con
   Distance Matrix API o Directions API (modo driving)
4. Si no hay API key: ordenar por barrio/zona como heurística simple
5. Guardar o actualizar en tabla rutas_dia
6. Responder:
{
  ruta_id,
  orden: [
    {
      posicion: 1,
      guia_id, numero_guia,
      nombre_destinatario, direccion_destinatario,
      lat?, lng?,
      distancia_desde_anterior_km?,
      tiempo_desde_anterior_min?
    }
  ],
  distancia_total_km,
  tiempo_total_min,
  fuente: "google_maps" | "heuristica"
}
```

### GET /api/v1/rutas/repartidor/:id
```
Rol: admin, repartidor (solo la propia)
Obtener la ruta del día del repartidor con el orden optimizado.

Query: ?fecha=YYYY-MM-DD (default: hoy)
Responder el orden guardado en rutas_dia + datos completos de cada guía.
```

### PATCH /api/v1/rutas/:ruta_id/orden
```
Rol: admin
El admin puede reordenar manualmente la ruta (drag & drop en frontend).

Body: { orden_guias: ["uuid1", "uuid2", "uuid3"] }
Actualizar el array en rutas_dia.orden_guias
```

---

## PASO 3 — BACKEND: `src/routes/zonas.js` (archivo nuevo)

### GET /api/v1/zonas
```
Roles: admin
Lista todas las zonas con sus barrios y repartidores asignados.

Respuesta:
[{
  id, nombre, descripcion, color, activa,
  barrios: ["El Prado", "Los Almendros", ...],
  repartidores: [{ id, nombre_completo }]
}]
```

### POST /api/v1/zonas
```
Rol: admin
Crear zona. Body: { nombre, descripcion?, color, barrios: [] }
```

### PUT /api/v1/zonas/:id
```
Rol: admin
Actualizar zona (nombre, descripción, color, barrios, repartidores asignados).
Body: { nombre?, color?, barrios?: [], repartidores?: [] }

Lógica para barrios: reemplazar lista completa (DELETE + INSERT)
Lógica para repartidores: reemplazar asignaciones (DELETE + INSERT)
```

### DELETE /api/v1/zonas/:id
```
Rol: admin — solo desactivar (activa=false), nunca borrar si tiene guías.
```

### GET /api/v1/zonas/detectar
```
Rol: admin, empresa
Detectar qué zona corresponde a una dirección (para autocompletar al crear guía).

Query: ?barrio=El%20Prado
Busca el barrio en zonas_barrios (ilike, case-insensitive).

Respuesta: { zona_id, zona_nombre } | null
```

---

## PASO 4 — BACKEND: `src/routes/devoluciones.js` (archivo nuevo)

### POST /api/v1/devoluciones
```
Rol: admin
Registrar una devolución de guía. Solo guías con estado 'devuelto'.

Body: {
  guia_id,
  motivo: 'no_contesto'|'direccion_incorrecta'|'rechazo_cliente'|
          'paquete_danado'|'direccion_no_existe'|'otro',
  descripcion?,
  foto_paquete_url?,
  crear_guia_retorno: true|false  -- ¿crear guía nueva para devolver al remitente?
}

Si crear_guia_retorno=true:
- Crear nueva guía con:
    nombre_remitente = empresa aliada original
    nombre_destinatario = nombre_remitente original (invertido)
    direccion_destinatario = dirección de la empresa aliada
    estado = 'registrado'
    observaciones = "RETORNO de guía " + numero_guia_original
- Guardar id en devoluciones.guia_retorno_id

Responder: { devolucion_id, guia_retorno_id? }
```

### GET /api/v1/devoluciones
```
Roles: admin, empresa (solo sus guías)
Listar devoluciones con filtros.

Query: ?estado= &motivo= &fecha_desde= &fecha_hasta= &empresa_id=

Respuesta con join a guias (numero_guia, empresa, destinatario) y repartidor.
```

### PATCH /api/v1/devoluciones/:id/estado
```
Rol: admin
Avanzar el estado: en_bodega → en_retorno → devuelto_remitente

Body: { estado, observaciones? }
```

### GET /api/v1/devoluciones/estadisticas
```
Rol: admin
Estadísticas agregadas de devoluciones para el dashboard.

Respuesta: {
  total: N,
  por_motivo: [{ motivo, cantidad, porcentaje }],
  tasa_devolucion: "12.3%"  // devoluciones / total guías período
}
```

---

## PASO 5 — BACKEND: firma digital en `repartidor.js`

Modificar `POST /api/v1/repartidor/guias/:guia_id/estado` para aceptar
campos adicionales cuando estado = 'entregado':

```javascript
// En el body del POST de estado, agregar campos opcionales:
// firma_url, nombre_receptor, cedula_receptor

// Al insertar en historial_estados:
const historial = await supabase.from('historial_estados').insert({
  guia_id, estado, nota, usuario_id: req.user.id,
  foto_evidencia_url,
  firma_url:       body.firma_url || null,
  nombre_receptor: body.nombre_receptor || null,
  cedula_receptor: body.cedula_receptor || null,
});
```

### POST /api/v1/repartidor/firma/:guia_id
```
Rol: repartidor
Subir la imagen de la firma digital a Supabase Storage.

Body: multipart/form-data, campo "firma" (PNG, generado desde canvas del celular)

- Subir a Storage: firmas/{guia_id}/{timestamp}.png
- Responder: { firma_url: "https://..." }
```

---

## PASO 6 — BACKEND: registrar todas las rutas en `index.js`

```javascript
app.use('/api/v1/gps',          require('./routes/gps'));
app.use('/api/v1/rutas',        require('./routes/rutas'));
app.use('/api/v1/zonas',        require('./routes/zonas'));
app.use('/api/v1/devoluciones', require('./routes/devoluciones'));
```

---

## PASO 7 — FRONTEND: Mapa centralizado `src/components/MapaBase.jsx`

Crear un componente de mapa que use **Leaflet** (gratuito, sin API key):

```jsx
// src/components/MapaBase.jsx
// Wrapper sobre react-leaflet que provee el mapa base con tiles de OpenStreetMap.
// Props:
//   center: [lat, lng]  (default: Santa Marta: [11.2408, -74.1990])
//   zoom: number (default: 13)
//   height: string (default: "400px")
//   children: markers, polylines, etc.

import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// IMPORTANTE: fix del icono roto de Leaflet con Webpack/Vite
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: markerShadow });

export default function MapaBase({ center = [11.2408, -74.1990], zoom = 13,
                                    height = '400px', children }) {
  return (
    <div style={{ height, borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}>
        <TileLayer
          attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {children}
      </MapContainer>
    </div>
  );
}
```

---

## PASO 8 — FRONTEND: nuevas páginas admin

### `src/pages/admin/AdminMapa.jsx` — mapa en tiempo real

```
┌──────────────────────────────────────────────────────────────┐
│  Mapa en tiempo real         Actualiza en: 28s  [🔄 Manual] │
├──────────────────────┬───────────────────────────────────────┤
│ Panel lateral        │                                       │
│                      │         [MAPA OpenStreetMap]          │
│ Repartidores activos │                                       │
│ ─────────────────── │   📍 Juan P.  (12 guías)              │
│ 🟢 Juan Pérez        │       └ En ruta · hace 2 min         │
│    Santa Marta Norte │                                       │
│    12 guías · 8 rest.│   📍 Pedro M. (8 guías)              │
│    [Ver ruta]        │       └ Activo · hace 1 min           │
│                      │                                       │
│ 🟡 Pedro Martínez    │   [Leyenda: 🟢 activo 🟡 sin movim]  │
│    Santa Marta Centro│                                       │
│    8 guías · 5 rest. │                                       │
│    [Ver ruta]        │                                       │
│                      │                                       │
│ 🔴 Sin conexión: 1   │                                       │
│    María González    │                                       │
│    Último ping: 45m  │                                       │
└──────────────────────┴───────────────────────────────────────┘
```

**Comportamiento:**
- Usar `react-leaflet` con tiles de OpenStreetMap
- Marcadores personalizados por color según actividad:
  - Verde: ping < 5 min
  - Amarillo: ping 5–20 min
  - Rojo: ping > 20 min o sin ubicación
- Marcador con popup: nombre, guías activas, último ping
- Auto-refresh cada 30 segundos vía polling a `GET /api/v1/gps/repartidores`
- Al hacer clic en "Ver ruta" en el panel → dibujar Polyline con el historial del día

### `src/pages/admin/AdminRutas.jsx` — gestión de rutas del día

```
┌────────────────────────────────────────────────────────────────┐
│  Rutas del día — miércoles 17 mar 2026                        │
│  [Seleccionar repartidor ▼]  [Optimizar ruta 🔄]  [Asignar] │
├──────────────────────┬─────────────────────────────────────────┤
│  Orden de entrega    │  [MAPA con ruta dibujada]               │
│  ─────────────────  │                                         │
│  1. MAG-0042         │  📍 Sede (inicio)                       │
│     Juan García      │     ↓                                   │
│     Cra 5 #14-32     │  1⃣  Cra 5 #14-32  (1.2 km · 4 min)    │
│     [↑][↓]           │     ↓                                   │
│  2. MAG-0038         │  2⃣  Cl 22 #7-45   (0.8 km · 3 min)    │
│     Ana López        │     ↓                                   │
│     Cl 22 #7-45      │  3⃣  ...                               │
│     [↑][↓]           │                                         │
│  3. MAG-0051         │  📏 Total: 12.4 km · ~58 min           │
│     ...              │                                         │
│  [Guardar orden]     │                                         │
└──────────────────────┴─────────────────────────────────────────┘
```

**Comportamiento:**
- Cargar las guías asignadas al repartidor seleccionado
- Botón "Optimizar ruta" → `POST /api/v1/rutas/optimizar` → reordenar la lista
- La lista es reordenable con drag & drop (usar `@dnd-kit/core`):
  ```bash
  npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
  ```
- Al cambiar el orden manualmente → botón "Guardar orden" → `PATCH /api/v1/rutas/:id/orden`
- El mapa dibuja una Polyline conectando las paradas en orden
- Mostrar distancia y tiempo estimado total

### `src/pages/admin/AdminZonas.jsx` — gestión de zonas

```
┌──────────────────────────────────────────────────┐
│ Zonas de reparto                  [+ Nueva zona] │
├──────────────────────────────────────────────────┤
│ ● Norte (azul)    3 repartidores · 8 barrios     │
│   Taganga, Bello Horizonte...          [✏️][🗑️]  │
│ ● Centro (verde)  2 repartidores · 12 barrios    │
│   El Prado, Los Almendros...           [✏️][🗑️]  │
│ ● Sur (naranja)   1 repartidor · 6 barrios       │
│   Bastidas, La Paz...                  [✏️][🗑️]  │
└──────────────────────────────────────────────────┘
```

**Modal editar zona:**
- Input nombre + color picker (input type="color")
- Textarea de barrios (uno por línea o separados por coma)
- Multi-select de repartidores (checkboxes)
- Botón guardar

### `src/pages/admin/AdminDevoluciones.jsx` — gestión de devoluciones

```
┌──────────────────────────────────────────────────────────────┐
│ Devoluciones                                                  │
├────────────────────┬─────────────────┬─────────────────────  │
│ En bodega: 12      │ En retorno: 5   │ Devuelto: 89          │
└────────────────────┴─────────────────┴─────────────────────  │
│ Filtros: [Motivo ▼] [Estado ▼] [Empresa ▼] [Desde] [Hasta]  │
├──────────────────────────────────────────────────────────────┤
│ Guía       │ Destinatario    │ Motivo          │ Estado       │
│ MAG-0019   │ Juan Pérez      │ No contestó     │ En bodega    │
│ MAG-0023   │ Ana García      │ Dir. incorrecta │ En retorno   │
└──────────────────────────────────────────────────────────────┘
```

**Al hacer clic en una fila:**
- Detalle completo
- Botones de avance de estado
- Si estado='en_bodega': botón "Crear guía de retorno"

---

## PASO 9 — FRONTEND: App del repartidor — actualizaciones

### `src/pages/repartidor/RepartidorGuias.jsx` — modificaciones

**1. Compartir ubicación GPS:**
```jsx
// Al montar el componente → iniciar geolocalización
useEffect(() => {
  if (!navigator.geolocation) return;

  // Enviar ubicación cada 30 segundos
  const enviarUbicacion = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsService.actualizarUbicacion(token, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision_m: Math.round(pos.coords.accuracy)
        });
      },
      (err) => console.warn('GPS no disponible:', err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  enviarUbicacion(); // inmediato al abrir
  const interval = setInterval(enviarUbicacion, 30000);

  // Al desmontar (cerrar la app / logout): desactivar
  return () => {
    clearInterval(interval);
    gpsService.desactivarUbicacion(token);
  };
}, [token]);
```

**2. Mostrar ruta del día:**
Agregar botón "Ver mi ruta" en la cabecera → abre modal con:
- Lista ordenada de las entregas del día (del endpoint `GET /api/v1/rutas/repartidor/:id`)
- Enlace "Abrir en Google Maps" con la ruta completa:
  `https://maps.google.com/maps/dir/?api=1&origin=lat,lng&destination=lat,lng&waypoints=lat,lng|lat,lng`

**3. Firma digital al entregar:**
Cuando el repartidor marca estado 'entregado', agregar al modal:
```
Al seleccionar "Entregado":
┌──────────────────────────────────────────────┐
│ Datos del receptor (opcional pero recomendado)│
│  Nombre: [_____________________]             │
│  Cédula: [_____________________]             │
│                                              │
│  Firma digital:                              │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │
│  │    [área de firma táctil - canvas]   │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│  [Limpiar firma]                            │
│                                             │
│  [📷 Foto evidencia]  [✅ Confirmar entrega] │
└──────────────────────────────────────────────┘
```

**Implementar el canvas de firma táctil:**
```jsx
// src/components/FirmaCanvas.jsx
// Canvas que captura el trazo del dedo en pantalla táctil
// Props: onFirma(dataURL) — callback cuando el usuario levanta el dedo
// Botón "Limpiar" que borra el canvas
// Al confirmar: convertir canvas.toDataURL('image/png') → blob → subir al backend
import { useRef, useEffect } from 'react';

export default function FirmaCanvas({ onFirma }) {
  const canvasRef = useRef(null);
  // implementar eventos: touchstart, touchmove, touchend, mousedown, mousemove, mouseup
  // dibujar con canvas 2D context
  // al touchend: llamar onFirma(canvas.toDataURL())
}
```

---

## PASO 10 — FRONTEND: Portal público de tracking — actualizar con mapa

### `src/pages/public/TrackingPage.jsx` — agregar mapa

Cuando el estado es 'en_ruta', mostrar sección adicional bajo el historial:

```jsx
// Si estado === 'en_ruta':
// 1. Llamar a GET /api/v1/gps/repartidor/:repartidor_id/ubicacion cada 30s
// 2. Si devuelve ubicación → mostrar el mapa con:
//    - Marcador azul: ubicación del repartidor (en movimiento)
//    - Marcador rojo: dirección del destinatario (geocodificada o estática)
//    - Texto: "El repartidor está en camino hacia tu dirección"
// 3. Si no devuelve ubicación (repartidor sin GPS activo):
//    → NO mostrar el mapa, solo el historial de estados

// Para geocodificar la dirección del destinatario sin API key:
// Usar Nominatim (OpenStreetMap geocoding gratuito):
// fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(direccion+", Santa Marta, Colombia")}&format=json&limit=1`)
```

---

## PASO 11 — FRONTEND: actualizar `api.js`

```javascript
// GPS
export const gpsService = {
  actualizarUbicacion: (token, data) =>
    req('PUT', '/gps/ubicacion', data, token),
  desactivarUbicacion: (token) =>
    req('DELETE', '/gps/ubicacion', null, token),
  listarRepartidores:  (token) =>
    req('GET', '/gps/repartidores', null, token),
  ubicacionPublica:    (repartidorId) =>
    req('GET', `/gps/repartidor/${repartidorId}/ubicacion`),
  historial:           (token, id, fecha) =>
    req('GET', `/gps/repartidor/${id}/historial${fecha ? '?fecha='+fecha : ''}`, null, token),
};

// Rutas
export const rutasService = {
  optimizar:    (token, data) =>
    req('POST', '/rutas/optimizar', data, token),
  obtener:      (token, repartidorId, fecha) =>
    req('GET', `/rutas/repartidor/${repartidorId}${fecha ? '?fecha='+fecha : ''}`, null, token),
  reordenar:    (token, rutaId, ordenGuias) =>
    req('PATCH', `/rutas/${rutaId}/orden`, { orden_guias: ordenGuias }, token),
};

// Zonas
export const zonasService = {
  listar:       (token) => req('GET', '/zonas', null, token),
  crear:        (token, data) => req('POST', '/zonas', data, token),
  actualizar:   (token, id, data) => req('PUT', `/zonas/${id}`, data, token),
  desactivar:   (token, id) => req('DELETE', `/zonas/${id}`, null, token),
  detectar:     (token, barrio) =>
    req('GET', `/zonas/detectar?barrio=${encodeURIComponent(barrio)}`, null, token),
};

// Devoluciones
export const devolucionesService = {
  crear:        (token, data) => req('POST', '/devoluciones', data, token),
  listar:       (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/devoluciones${qs ? '?'+qs : ''}`, null, token);
  },
  cambiarEstado: (token, id, data) =>
    req('PATCH', `/devoluciones/${id}/estado`, data, token),
  estadisticas:  (token) => req('GET', '/devoluciones/estadisticas', null, token),
};

// Firma
export const firmaService = {
  subir: (token, guiaId, blob) => {
    const fd = new FormData();
    fd.append('firma', blob, 'firma.png');
    return fetch(`${BASE}/repartidor/firma/${guiaId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(r => r.json().then(d => r.ok ? d : Promise.reject(new Error(d.error))));
  },
};
```

---

## PASO 12 — FRONTEND: actualizar `Layout.jsx` y `LayoutMovil.jsx`

```javascript
// Nuevos items en el menú admin:
admin: [
  { to: '/admin/dashboard',      label: 'Dashboard',      icon: 'chart' },
  { to: '/admin/guias',          label: 'Guías',          icon: 'doc' },
  { to: '/admin/mapa',           label: 'Mapa en vivo',   icon: 'map' },
  { to: '/admin/rutas',          label: 'Rutas',          icon: 'route' },
  { to: '/admin/zonas',          label: 'Zonas',          icon: 'zone' },
  { to: '/admin/devoluciones',   label: 'Devoluciones',   icon: 'return' },
  { to: '/admin/usuarios',       label: 'Usuarios',       icon: 'users' },
  { to: '/admin/liquidaciones',  label: 'Liquidaciones',  icon: 'money' },
  { to: '/admin/caja',           label: 'Caja COD',       icon: 'cash' },
  { to: '/admin/tarifas',        label: 'Tarifas',        icon: 'settings' },
],
```

---

## PASO 13 — FRONTEND: nuevas rutas en `App.jsx`

```jsx
import AdminMapa          from './pages/admin/AdminMapa';
import AdminRutas         from './pages/admin/AdminRutas';
import AdminZonas         from './pages/admin/AdminZonas';
import AdminDevoluciones  from './pages/admin/AdminDevoluciones';

// En <Routes>:
<Route path="/admin/mapa"
  element={<PrivateRoute roles={['admin']}><AdminMapa /></PrivateRoute>} />
<Route path="/admin/rutas"
  element={<PrivateRoute roles={['admin']}><AdminRutas /></PrivateRoute>} />
<Route path="/admin/zonas"
  element={<PrivateRoute roles={['admin']}><AdminZonas /></PrivateRoute>} />
<Route path="/admin/devoluciones"
  element={<PrivateRoute roles={['admin']}><AdminDevoluciones /></PrivateRoute>} />
```

---

## PASO 14 — INTEGRACIÓN: autodetectar zona al crear guía

En `AdminGuias.jsx` y `EmpresaGuias.jsx`, en el formulario de nueva guía:
- Cuando el usuario escribe el barrio → llamar a `GET /api/v1/zonas/detectar?barrio=X`
- Si devuelve zona → mostrar badge "📍 Zona: Norte" junto al campo
- Al crear la guía → enviar `zona_id` en el body si fue detectada
- Esto permite asignación automática al repartidor de la zona en el futuro

---

## CRITERIOS DE VERIFICACIÓN AL TERMINAR

**Backend GPS:**
1. `PUT /gps/ubicacion` con token de repartidor actualiza su ubicación en < 100ms
2. `GET /gps/repartidores` devuelve la lista con tiempo desde último ping
3. `GET /gps/repartidor/:id/ubicacion` (sin auth) devuelve lat/lng o 404

**Backend rutas:**
4. `POST /rutas/optimizar` devuelve las guías reordenadas (con heurística si no hay API key)
5. `PATCH /rutas/:id/orden` guarda el nuevo orden manualmente

**Backend zonas:**
6. `GET /zonas/detectar?barrio=El%20Prado` devuelve la zona correcta
7. `PUT /zonas/:id` actualiza barrios y repartidores asignados correctamente

**Backend devoluciones:**
8. `POST /devoluciones` con `crear_guia_retorno=true` crea la guía de retorno
9. `GET /devoluciones/estadisticas` devuelve tasa de devolución y desglose por motivo

**Frontend:**
10. AdminMapa muestra marcadores de repartidores con color según actividad
11. Al hacer clic en un marcador → popup con nombre y guías activas
12. AdminRutas permite reordenar guías con drag & drop y ver la ruta en el mapa
13. AdminZonas permite crear/editar zonas con barrios y repartidores
14. RepartidorGuias comparte ubicación GPS automáticamente al abrir la app
15. El modal de "Entregado" muestra el canvas de firma táctil
16. TrackingPage muestra el mapa con la ubicación del repartidor si está en_ruta
17. AdminDevoluciones lista las devoluciones con opciones para avanzar estado

---

## INSTRUCCIONES PARA EL MODELO

1. **Ejecutar el SQL** de las nuevas tablas en Supabase antes de codear
2. **Instalar dependencias**: `react-leaflet leaflet @dnd-kit/core @dnd-kit/sortable`
   en frontend y `@googlemaps/google-maps-services-js` en backend
3. **Crear** `src/routes/gps.js`, `src/routes/rutas.js`, `src/routes/zonas.js`,
   `src/routes/devoluciones.js`
4. **Registrar** todas las rutas en `index.js`
5. **Crear** `src/components/MapaBase.jsx` con Leaflet (funciona sin API key)
6. **Crear** `src/components/FirmaCanvas.jsx` con captura táctil
7. **Implementar** `AdminMapa.jsx`, `AdminRutas.jsx`, `AdminZonas.jsx`,
   `AdminDevoluciones.jsx`
8. **Modificar** `RepartidorGuias.jsx`: agregar GPS automático + firma digital +
   modal de ruta del día
9. **Modificar** `TrackingPage.jsx`: agregar mapa cuando estado es 'en_ruta'
10. **Modificar** `AdminGuias.jsx` y `EmpresaGuias.jsx`: autodetectar zona al crear
11. **Actualizar** `Layout.jsx` con nuevos items del menú
12. **Actualizar** `App.jsx` con las nuevas rutas
13. **Actualizar** `api.js` con todos los nuevos servicios
14. **IMPORTANTE sobre Leaflet**: siempre importar `import 'leaflet/dist/leaflet.css'`
    y aplicar el fix del icono (ver PASO 7) para evitar el error del marcador roto
15. El GPS del repartidor es **opt-in**: si el usuario niega el permiso de ubicación,
    la app funciona igual, solo sin compartir posición. Nunca bloquear la UI por GPS.
16. Al finalizar mostrar árbol completo de archivos nuevos y modificados en esta fase

¡Implementa la Fase 6 completa!
