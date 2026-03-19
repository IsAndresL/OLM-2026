# PROMPT COMPLETO — FASE 4
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# Fase: 4 · Dashboard analítico + Reportes Excel + Deploy a producción
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior finalizando el sistema
**Operaciones Logísticas del Magdalena**. Las Fases 1, 2 y 3 ya están completas:
autenticación, CRUD de guías, etiquetas PDF, app del repartidor, tracking público
y notificaciones WhatsApp.

---

## CONTEXTO DEL PROYECTO

Sistema de gestión logística de última milla. Esta es la fase final: analytics,
reportes y deploy a producción.

Stack: **React + Vite + Tailwind** (frontend) | **Node.js + Express** (backend)
| **Supabase PostgreSQL + Storage** (datos)

---

## ESTRUCTURA EXISTENTE (Fases 1–3 completadas)

```
operaciones-magdalena/
├── backend/src/
│   ├── index.js                  ✅
│   ├── config/supabase.js        ✅
│   ├── middlewares/auth.js       ✅
│   └── routes/
│       ├── auth.js               ✅
│       ├── guias.js              ✅ CRUD + historial + cambio estado
│       ├── etiquetas.js          ✅ PDF + QR
│       ├── repartidor.js         ✅ mis-guías + estado + evidencia
│       ├── tracking.js           ✅ portal público
│       ├── usuarios.js           ✅ CRUD
│       ├── empresas.js           ✅ listar
│       ├── dashboard.js          ⚠️  PLACEHOLDER — implementar ahora
│       └── reportes.js           ⚠️  PLACEHOLDER — implementar ahora
└── frontend/src/
    ├── services/api.js           ✅
    ├── context/AuthContext.jsx   ✅
    ├── components/
    │   ├── Layout.jsx            ✅ sidebar + header
    │   ├── LayoutMovil.jsx       ✅ para repartidor
    │   └── BadgeEstado.jsx       ✅
    └── pages/
        ├── admin/AdminDashboard.jsx   ⚠️  PLACEHOLDER — implementar ahora
        ├── empresa/EmpresaDashboard.jsx ⚠️  PLACEHOLDER — implementar ahora
        └── admin/AdminUsuarios.jsx    ✅ referencia de estilo
```

---

## MODELO DE DATOS (tablas en Supabase)

```sql
guias: id, numero_guia, empresa_id, repartidor_id, estado_actual,
       nombre_destinatario, ciudad_destino, peso_kg, created_at, updated_at

historial_estados: id, guia_id, estado, usuario_id, created_at

usuarios: id, nombre_completo, rol, empresa_id, activo

empresas: id, nombre
```

---

## LO QUE DEBES IMPLEMENTAR EN FASE 4

### OBJETIVO
Al terminar esta fase el administrador tiene un dashboard analítico en tiempo
real con KPIs del día, gráficas de tendencia, alertas operativas y la capacidad
de exportar reportes completos a Excel. La empresa aliada tiene su propio
dashboard con métricas de sus envíos. El sistema queda configurado y listo para
deploy a producción en Railway (backend) y Vercel (frontend).

---

## PASO 1 — BACKEND: `src/routes/dashboard.js` (reemplazar placeholder)

### Dependencias a instalar:
```bash
npm install xlsx-js-style
```
(para exportar Excel con estilos. La librería `xlsx` ya está instalada pero
`xlsx-js-style` permite colores en celdas del header)

### GET /api/v1/dashboard/resumen
```
Rol: admin
Query params: ?fecha=YYYY-MM-DD (default: hoy)

Respuesta — todo calculado con queries a Supabase:
{
  fecha: "2026-03-17",
  kpis: {
    total_registradas: N,   // guías creadas en esa fecha
    total_asignadas:   N,   // estado actual = asignado
    total_en_ruta:     N,   // estado actual = en_ruta
    total_entregadas:  N,   // entregadas en esa fecha (por historial)
    total_novedades:   N,   // no_contesto + direccion_incorrecta + reagendar
    total_devueltas:   N,   // devueltas en esa fecha
    tasa_efectividad:  "78.5%",  // entregadas / (entregadas + novedades + devueltas)
    sin_asignar:       N,   // estado = registrado (alerta)
  },
  por_repartidor: [
    {
      repartidor_id, nombre_completo,
      asignadas: N,     // guías asignadas HOY
      entregadas: N,    // entregadas HOY
      novedades: N,
      tasa: "85.0%"
    }
  ],
  por_empresa: [
    {
      empresa_id, nombre,
      activas: N,    // guías no finalizadas
      entregadas_hoy: N
    }
  ],
  alertas: [
    // Guías sin movimiento > 24 horas (estado no ha cambiado)
    { guia_id, numero_guia, nombre_destinatario, horas_sin_movimiento: 26 }
  ]
}

Lógica de alertas:
- Buscar guías con estado en ('asignado', 'en_ruta', 'no_contesto', 'reagendar')
- WHERE updated_at < NOW() - INTERVAL '24 hours'
- Máximo 10 alertas (las más antiguas primero)
```

### GET /api/v1/dashboard/tendencia
```
Rol: admin
Query params: ?dias=30 (default 30, máx 90) &empresa_id= (opcional)

Respuesta — serie temporal para gráfico de barras:
[
  {
    fecha: "2026-03-01",
    registradas: 45,
    entregadas:  38,
    novedades:   5,
    devueltas:   2
  },
  ...
]

Lógica:
- Generar array de fechas para los últimos N días
- Para cada fecha contar guías por estado_actual en ese día
- Usar created_at para registradas, y historial_estados.created_at para los demás
```

### GET /api/v1/dashboard/empresa (para el panel de empresa aliada)
```
Rol: empresa
No query params — usa empresa_id del JWT

Respuesta:
{
  kpis: {
    total_activas:    N,   // guías no finalizadas
    total_entregadas: N,   // entregadas (histórico completo)
    total_novedades:  N,
    tasa_efectividad: "82.1%"
  },
  recientes: [  // últimas 10 guías, cualquier estado
    { numero_guia, nombre_destinatario, estado_actual, created_at }
  ],
  tendencia_semanal: [  // últimos 7 días
    { fecha, registradas, entregadas }
  ]
}
```

---

## PASO 2 — BACKEND: `src/routes/reportes.js` (reemplazar placeholder)

### GET /api/v1/reportes/exportar
```
Roles: admin, empresa
Query params:
  ?fecha_desde=YYYY-MM-DD &fecha_hasta=YYYY-MM-DD
  &empresa_id=uuid (solo admin puede filtrar por empresa)
  &repartidor_id=uuid
  &estado=

Lógica:
1. Construir query con los filtros
2. Si rol = 'empresa' → forzar empresa_id = req.user.empresa_id
3. Traer todas las guías (sin paginación, hasta 5000 registros)
4. Para cada guía hacer join con empresa, repartidor, y último estado del historial
5. Generar Excel con xlsx-js-style

Estructura del Excel — 1 hoja "Guías":
Columnas:
  Número de guía | Fecha registro | Remitente | Destinatario |
  Teléfono dest. | Dirección | Ciudad | Barrio |
  Peso (kg) | Valor declarado | Estado actual |
  Empresa | Repartidor | Fecha último cambio | Observaciones

Estilos:
- Fila de encabezado: fondo azul (#1D4ED8), texto blanco, negrita
- Filas alternas: fondo gris claro (#F9FAFB) / blanco
- Ancho de columnas automático según contenido
- Congelar primera fila (freeze panes)

Response headers:
  Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  Content-Disposition: attachment; filename="reporte-magdalena-FECHA.xlsx"
```

### Código de referencia para xlsx-js-style:
```javascript
const XLSX = require('xlsx-js-style');

function generarExcel(guias) {
  const wb = XLSX.utils.book_new();

  // Encabezados
  const headers = ['Número guía','Fecha registro','Remitente','Destinatario',
    'Teléfono','Dirección','Ciudad','Barrio','Peso kg','Valor declarado',
    'Estado','Empresa','Repartidor','Fecha último estado','Observaciones'];

  const headerStyle = {
    fill: { fgColor: { rgb: '1D4ED8' } },
    font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      bottom: { style: 'thin', color: { rgb: 'FFFFFF' } }
    }
  };

  // Construir filas
  const rows = [
    headers.map(h => ({ v: h, s: headerStyle })),
    ...guias.map((g, i) => {
      const shade = i % 2 === 0;
      const cellStyle = shade
        ? { fill: { fgColor: { rgb: 'F9FAFB' } }, font: { sz: 10 } }
        : { font: { sz: 10 } };
      return [
        g.numero_guia, g.created_at?.substring(0, 10),
        g.nombre_remitente, g.nombre_destinatario,
        g.telefono_destinatario, g.direccion_destinatario,
        g.ciudad_destino, g.barrio || '',
        g.peso_kg || '', g.valor_declarado || '',
        g.estado_actual,
        g.empresa?.nombre || '', g.repartidor?.nombre_completo || '',
        g.ultimo_cambio?.substring(0, 16)?.replace('T',' ') || '',
        g.observaciones || ''
      ].map(v => ({ v: v ?? '', s: cellStyle }));
    })
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ancho de columnas
  ws['!cols'] = [10,12,18,18,13,25,12,12,8,12,14,18,18,16,20].map(w => ({ wch: w }));

  // Congelar primera fila
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, 'Guías');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
```

---

## PASO 3 — FRONTEND: Dashboard del administrador

### `src/pages/admin/AdminDashboard.jsx` — implementación completa

Instalar en el **frontend**:
```bash
npm install recharts
```

**Layout de la página:**

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard            Hoy: miércoles 17 mar 2026           │
│                       [← Ayer] [Hoy] [Mañana →]           │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────┤
│ Registr. │ En ruta  │Entregadas│ Novedades│Efectivid.│S/asig│
│    45    │    12    │    31    │    8     │  77.5%  │  2  │
│ ●●●●○    │ ●●●○○    │ ●●●●●    │ ●●○○○    │         │ ⚠️  │
└──────────┴──────────┴──────────┴──────────┴──────────┴─────┘
├─────────────────────────────────────────────────────────────┤
│  TENDENCIA (últimos 30 días)          Filtrar: [30d][7d][90d]│
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [gráfico de barras apiladas: registradas/entregadas/ │   │
│  │  novedades/devueltas por día]                        │   │
│  └──────────────────────────────────────────────────────┘   │
├───────────────────┬─────────────────────────────────────────┤
│  REPARTIDORES HOY │  ALERTAS                                │
│  ─────────────── │  ─────────────────────────────────────  │
│  Juan P.  8/10 ✅ │  ⚠️ MAG-0015 · 28h sin movimiento     │
│  Pedro R. 5/7  ✅ │  ⚠️ MAG-0019 · 26h sin movimiento     │
│  María G. 3/5  ⚠️ │  ⚠️ MAG-0023 · 25h sin movimiento     │
│                   │  [Ver todas →]                          │
├───────────────────┴─────────────────────────────────────────┤
│  POR EMPRESA                                                │
│  X Cargo: 18 activas · 45 entregadas hoy                   │
│  Temu:    12 activas · 31 entregadas hoy                   │
└─────────────────────────────────────────────────────────────┘
```

**Componentes a construir dentro de la página:**

**KPICard** — tarjeta de métrica:
```jsx
// Props: titulo, valor, subtitulo, color, icono, alerta (bool)
// Si alerta=true: borde rojo y icono de advertencia
// Si tasa_efectividad: mostrar barra de progreso de color
function KPICard({ titulo, valor, subtitulo, color, alerta }) {
  // color puede ser: 'blue', 'amber', 'green', 'orange', 'red', 'gray'
}
```

**GraficoTendencia** — BarChart con Recharts:
```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
         Legend, ResponsiveContainer } from 'recharts';
// Colores: registradas=#93C5FD, entregadas=#34D399, novedades=#FCD34D, devueltas=#F87171
// Tooltip personalizado que muestre fecha formateada y todos los valores
// Eje X: mostrar solo día/mes (ej. "17 mar"), no año completo
```

**TablaRepartidores** — tabla con performance del día:
```jsx
// Columnas: nombre, asignadas, entregadas, novedades, tasa%
// Badge de color en tasa: verde >80%, amarillo 50-80%, rojo <50%
// Ordenar por mayor cantidad de entregadas
```

**ListaAlertas** — tarjetas de guías con tiempo sin movimiento:
```jsx
// Cada alerta: número de guía (azul clickeable), destinatario, horas_sin_movimiento
// Al hacer clic en el número de guía: ir a /admin/guias?buscar=MAG-XXXX
// Si no hay alertas: mensaje "✅ Sin alertas operativas"
```

**Comportamiento:**
- Carga los datos al montar: `GET /api/v1/dashboard/resumen` + `GET /api/v1/dashboard/tendencia`
- Botones ← Ayer / Hoy → cambian la fecha del resumen
- Toggle de días (7d / 30d / 90d) cambia el rango del gráfico
- Skeleton loaders mientras carga cada sección (no bloquear toda la página)
- Auto-refresh del resumen cada 5 minutos (setInterval + clearInterval en cleanup)
- Botón de recarga manual (ícono de refresh girando mientras carga)

**Sección de exportación** (al pie del dashboard o en un panel lateral):
```
[📥 Exportar Excel]  →  abre un pequeño panel con:
  - Date pickers: Desde / Hasta
  - Select: Empresa (todos / por empresa)
  - Select: Estado (todos / por estado)
  - Select: Repartidor (todos / por repartidor)
  - Botón "Descargar" → llama a GET /api/v1/reportes/exportar
    y dispara la descarga del .xlsx
```

---

## PASO 4 — FRONTEND: Dashboard de empresa

### `src/pages/empresa/EmpresaDashboard.jsx` — implementación completa

Versión simplificada del dashboard, solo datos de su empresa:

```
┌─────────────────────────────────────────────┐
│  Mi resumen                                 │
├──────────┬──────────┬──────────┬────────────┤
│ Activas  │Entregadas│ Novedades│Efectividad │
│    18    │    312   │    24    │   92.9%    │
└──────────┴──────────┴──────────┴────────────┘
├─────────────────────────────────────────────┤
│  Últimos 7 días       (gráfico de líneas)  │
└─────────────────────────────────────────────┘
├─────────────────────────────────────────────┤
│  Últimas guías                              │
│  MAG-0052  Juan Pérez    En ruta  17 mar   │
│  MAG-0051  Ana López     Entregado 17 mar  │
│  [Ver todas →]                             │
├─────────────────────────────────────────────┤
│  [📥 Exportar mis guías]                   │
└─────────────────────────────────────────────┘
```

- Llama a `GET /api/v1/dashboard/empresa`
- Gráfico de líneas con Recharts (LineChart en lugar de BarChart)
- Tabla de últimas 10 guías con enlace a `/empresa/guias`
- Botón de exportar que llama a `GET /api/v1/reportes/exportar`
  (el backend filtra automáticamente por empresa_id del JWT)

---

## PASO 5 — FRONTEND: actualizar `api.js`

Agregar servicios de dashboard y reportes:

```javascript
export const dashboardService = {
  resumen:   (token, fecha) =>
    req('GET', `/dashboard/resumen${fecha ? '?fecha='+fecha : ''}`, null, token),
  tendencia: (token, dias = 30, empresaId) => {
    const qs = new URLSearchParams({ dias, ...(empresaId && { empresa_id: empresaId }) });
    return req('GET', `/dashboard/tendencia?${qs}`, null, token);
  },
  empresa:   (token) => req('GET', '/dashboard/empresa', null, token),
};

export const reportesService = {
  exportar: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetch(`${BASE}/reportes/exportar${qs ? '?'+qs : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (!r.ok) throw new Error('Error al generar reporte');
      return r.blob();
    });
  },
};
```

---

## PASO 6 — PREPARAR PARA PRODUCCIÓN

### `backend/.env.production` (crear como referencia, NO commitear)
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
JWT_SECRET=[generar uno nuevo y largo para producción]
PORT=4000
NODE_ENV=production
FRONTEND_URL=https://magdalena.vercel.app  [tu dominio real]
WHAPI_TOKEN=[token de Whapi.cloud en producción]
WHAPI_URL=https://gate.whapi.cloud/messages/text
```

### `frontend/.env.production`
```
VITE_API_URL=https://magdalena-backend.railway.app/api/v1
```

### `backend/src/index.js` — agregar ajustes para producción:
```javascript
// Después de require('dotenv').config():
if (process.env.NODE_ENV === 'production') {
  // Limitar tamaño del body en producción
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Trust proxy (necesario en Railway/Render detrás de load balancer)
  app.set('trust proxy', 1);
}

// CORS — en producción solo aceptar el dominio del frontend
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
```

### `backend/Procfile` (para Railway)
```
web: node src/index.js
```

### `frontend/vite.config.js` — ajuste para build de producción:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          charts:   ['recharts'],
        }
      }
    }
  }
});
```

### `frontend/public/_redirects` (para Vercel con SPA routing)
```
/* /index.html 200
```

### `README.md` — actualizar con instrucciones de deploy:
```markdown
## Deploy

### Backend en Railway
1. Crear cuenta en railway.app
2. New project → Deploy from GitHub repo
3. Seleccionar carpeta /backend como root directory
4. Agregar variables de entorno (copiar de .env.example)
5. El deploy es automático en cada push a main

### Frontend en Vercel
1. Crear cuenta en vercel.com
2. Import project → GitHub repo
3. Root directory: /frontend
4. Build command: npm run build
5. Output directory: dist
6. Agregar variable VITE_API_URL con la URL de Railway
7. Deploy

### Variables de entorno requeridas (Railway):
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET,
PORT, NODE_ENV=production, FRONTEND_URL, WHAPI_TOKEN, WHAPI_URL
```

---

## PASO 7 — COMPONENTES UTILITARIOS FINALES

### `src/components/SkeletonCard.jsx` (reutilizable para loading states):
```jsx
// Rectángulo animado con pulse de Tailwind
// Props: height (default: 'h-24'), className
export default function SkeletonCard({ height = 'h-24', className = '' }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-2xl ${height} ${className}`} />
  );
}
```

### `src/components/Alerta.jsx` (notificaciones temporales in-app):
```jsx
// Props: tipo ('success'|'error'|'warning'|'info'), mensaje, onClose
// Auto-cierra después de 4 segundos
// Posición: top-right, fixed, z-50
// Animación: slide-in desde arriba con Tailwind transition
export default function Alerta({ tipo, mensaje, onClose }) { ... }
```

### `src/hooks/useAlerta.js` (hook para usar Alerta fácilmente):
```javascript
// Devuelve: { alerta, mostrarAlerta, cerrarAlerta }
// mostrarAlerta(tipo, mensaje) → activa la alerta
// Ejemplo:
// const { alerta, mostrarAlerta } = useAlerta();
// mostrarAlerta('success', 'Guía creada correctamente');
// <Alerta {...alerta} onClose={cerrarAlerta} />
```

---

## CRITERIOS DE VERIFICACIÓN AL TERMINAR

**Backend:**
1. `GET /api/v1/dashboard/resumen` devuelve kpis del día con tasa_efectividad calculada
2. `GET /api/v1/dashboard/tendencia?dias=7` devuelve array de 7 fechas con conteos
3. `GET /api/v1/dashboard/empresa` con token de empresa solo devuelve sus datos
4. `GET /api/v1/reportes/exportar?fecha_desde=2026-03-01&fecha_hasta=2026-03-17` descarga un `.xlsx`
5. El Excel descargado tiene header azul, filas alternas, primera fila congelada

**Frontend:**
6. AdminDashboard muestra los 6 KPIs del día con colores correctos
7. El gráfico de barras muestra los últimos 30 días con 4 series de datos
8. La tabla de repartidores muestra nombre, asignadas, entregadas y tasa con badge de color
9. Las alertas muestran guías sin movimiento > 24h con enlace clickeable
10. El botón "Exportar Excel" descarga el archivo correctamente
11. EmpresaDashboard muestra sus propias métricas (no datos de otras empresas)
12. Los skeletons se muestran mientras cargan los datos (no pantalla en blanco)

**Producción:**
13. `npm run build` en frontend no produce errores
14. El `Procfile` tiene el comando correcto para Railway
15. `_redirects` está en `/public` para que las rutas SPA funcionen en Vercel

---

## INSTRUCCIONES PARA EL MODELO

1. **Reemplaza completamente** los placeholders de `dashboard.js` y `reportes.js`
2. **Implementa** `AdminDashboard.jsx` con los 4 componentes internos:
   KPICard, GraficoTendencia, TablaRepartidores, ListaAlertas
3. **Implementa** `EmpresaDashboard.jsx` con KPIs y gráfico de líneas
4. **Crea** `SkeletonCard.jsx`, `Alerta.jsx` y `useAlerta.js`
5. **Actualiza** `api.js` con dashboardService y reportesService
6. **Configura** los archivos de producción: `Procfile`, `_redirects`,
   actualizar `vite.config.js` e `index.js` del backend
7. **Actualiza** el `README.md` con instrucciones de deploy
8. Usa **Recharts** para los gráficos — importar solo los componentes necesarios
9. Usa **Tailwind** para todos los estilos, mantener consistencia visual con
   el resto del proyecto
10. Al finalizar muestra el árbol completo de archivos del proyecto
    (marcando ✅ completo / ✅ nuevo en esta fase) y una lista de
    los pasos manuales restantes para el deploy

¡Implementa la Fase 4 completa y deja el sistema listo para producción!
