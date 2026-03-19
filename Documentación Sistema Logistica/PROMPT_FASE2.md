# PROMPT COMPLETO — FASE 2
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# Fase: 2 · Gestión de guías + Etiquetas PDF
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior continuando el desarrollo del sistema
**Operaciones Logísticas del Magdalena**. La Fase 1 ya está completa y funcionando:
autenticación JWT, roles (admin / empresa / repartidor), rutas protegidas y
estructura base del proyecto.

---

## CONTEXTO DEL PROYECTO

Sistema de gestión logística de última milla. Roles del sistema:
- `admin` — acceso total
- `empresa` — ve y gestiona solo sus propias guías
- `repartidor` — ve sus guías asignadas (Fase 3)
- cliente final — rastreo público (Fase 3)

Stack: **React + Vite + Tailwind** (frontend) | **Node.js + Express** (backend)
| **Supabase PostgreSQL + Storage** (datos y archivos)

---

## ESTRUCTURA EXISTENTE (ya implementada en Fase 1)

```
operaciones-magdalena/
├── backend/src/
│   ├── index.js               ✅ servidor Express configurado
│   ├── config/supabase.js     ✅ cliente Supabase (service_role)
│   ├── middlewares/auth.js    ✅ verificarToken + checkRole
│   └── routes/
│       ├── auth.js            ✅ login / logout / me
│       ├── guias.js           ⚠️  PLACEHOLDER — implementar ahora
│       ├── etiquetas.js       ⚠️  PLACEHOLDER — implementar ahora
│       ├── usuarios.js        ✅ CRUD completo
│       ├── dashboard.js       placeholder Fase 4
│       ├── reportes.js        placeholder Fase 4
│       ├── repartidor.js      placeholder Fase 3
│       └── tracking.js        placeholder Fase 3
└── frontend/src/
    ├── services/api.js        ✅ fetch wrapper + guiasService
    ├── context/AuthContext.jsx ✅ user / token / rol
    ├── router/PrivateRoute.jsx ✅ protección por rol
    └── pages/
        ├── admin/AdminGuias.jsx     ⚠️  PLACEHOLDER — implementar ahora
        ├── empresa/EmpresaGuias.jsx ⚠️  PLACEHOLDER — implementar ahora
        └── admin/AdminUsuarios.jsx  ✅ CRUD completo (referencia de estilo)
```

---

## MODELO DE DATOS (tablas ya creadas en Supabase)

```sql
-- Tabla: guias
id UUID PK, numero_guia VARCHAR(30) UNIQUE,
empresa_id UUID FK→empresas, repartidor_id UUID FK→usuarios (nullable),
estado_actual VARCHAR CHECK IN ('registrado','asignado','en_ruta',
  'entregado','no_contesto','direccion_incorrecta','reagendar','devuelto'),
nombre_remitente VARCHAR, nombre_destinatario VARCHAR,
telefono_destinatario VARCHAR, direccion_destinatario TEXT,
ciudad_destino VARCHAR, barrio VARCHAR, descripcion_paquete TEXT,
peso_kg DECIMAL, valor_declarado DECIMAL, observaciones TEXT,
fecha_estimada_entrega DATE, etiqueta_pdf_url TEXT,
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ

-- Función SQL existente para número automático:
-- SELECT generar_numero_guia() → 'MAG-20260317-0001'
```

---

## LO QUE DEBES IMPLEMENTAR EN FASE 2

### OBJETIVO
Al terminar esta fase el administrador puede: registrar guías (individual y
masivo desde Excel), asignar repartidores, descargar etiquetas PDF con código
QR, y ver la tabla de guías filtrable. La empresa aliada puede hacer lo mismo
pero solo ve sus propias guías.

---

## PASO 1 — BACKEND: `src/routes/guias.js` (reemplazar placeholder completo)

Implementar todos los endpoints con lógica real:

### Dependencias a instalar en backend:
```bash
npm install qrcode bwip-js
```
`qrcode` ya está en el ecosistema, úsalo para generar QR en base64.

### Middleware de filtro por empresa
Crear función helper `filtrarPorEmpresa(req, query)`:
- Si `req.user.rol === 'empresa'` → añade `.eq('empresa_id', req.user.empresa_id)` al query
- Si `req.user.rol === 'admin'` → no añade filtro (ve todo)

### Endpoints a implementar:

**GET /api/v1/guias** — listar con filtros y paginación
```
Query params: ?estado=&empresa_id=&repartidor_id=&fecha_desde=&fecha_hasta=&q=&page=1&limit=50
- Filtrar por empresa automáticamente si rol = 'empresa'
- q = busca en numero_guia, nombre_destinatario, telefono_destinatario
- Ordenar: created_at DESC
- Respuesta: { data: [...guias], total: N, page: 1, limit: 50 }
- Incluir join con empresa (nombre) y repartidor (nombre_completo)
```

**GET /api/v1/guias/:id** — detalle de una guía
```
- Verificar acceso: empresa solo puede ver sus propias guías
- Incluir historial_estados ordenado DESC
- Respuesta: { ...guia, empresa: {nombre}, repartidor: {nombre_completo}, historial: [...] }
```

**POST /api/v1/guias** — crear guía individual
```
Body requerido: nombre_remitente, nombre_destinatario, telefono_destinatario,
  direccion_destinatario, ciudad_destino
Body opcional: barrio, descripcion_paquete, peso_kg, valor_declarado,
  observaciones, fecha_estimada_entrega

Lógica:
1. Si rol = 'empresa' → empresa_id = req.user.empresa_id (ignorar body.empresa_id)
2. Si rol = 'admin' → empresa_id = body.empresa_id (requerido)
3. Generar numero_guia llamando a la función SQL: SELECT generar_numero_guia()
4. Insertar guía con estado 'registrado'
5. Insertar primera entrada en historial_estados: { estado: 'registrado', usuario_id: req.user.id }
6. Responder con la guía creada
```

**POST /api/v1/guias/bulk** — carga masiva desde Excel/CSV
```
- Recibir archivo con multer (campo: 'archivo', acepta .xlsx y .csv, max 5MB)
- Parsear con la librería xlsx (ya instalada)
- Columnas esperadas en el Excel (case-insensitive):
    nombre_remitente, nombre_destinatario, telefono_destinatario,
    direccion_destinatario, ciudad_destino, barrio (opcional),
    descripcion_paquete (opcional), peso_kg (opcional), valor_declarado (opcional)
- Validar cada fila: campos requeridos no vacíos
- Crear cada guía con generar_numero_guia() (llamar una vez por guía)
- Insertar historial para cada guía creada
- Responder: { creadas: N, errores: M, detalle_errores: [{ fila, motivo }] }
- Si hay errores en algunas filas, igual crear las válidas (no hacer rollback total)
```

**PUT /api/v1/guias/:id** — editar guía
```
- Solo permitido si estado = 'registrado'
- Admin puede editar cualquier guía
- Empresa solo puede editar sus propias guías
- No permitir editar: numero_guia, empresa_id, estado_actual
- Responder 409 si la guía ya está en estado posterior a 'registrado'
```

**PATCH /api/v1/guias/:id/asignar** — asignar repartidor
```
Body: { repartidor_id: "uuid" }
- Solo admin
- Validar que el usuario existe y tiene rol 'repartidor'
- Actualizar repartidor_id y estado a 'asignado'
- Insertar en historial_estados: { estado: 'asignado', usuario_id: req.user.id, nota: 'Asignado a: [nombre repartidor]' }
```

**DELETE /api/v1/guias/:id** — solo si estado = 'registrado'
```
- Solo admin
- Solo borrar si estado es 'registrado' (nunca borrar guías en curso)
- Responder 409 si no se puede borrar
```

---

## PASO 2 — BACKEND: `src/routes/etiquetas.js` (reemplazar placeholder)

### Dependencias (ya están instaladas):
- `pdfkit` — generación de PDF
- `qrcode` — QR en base64 (instalar: npm install qrcode)

### Diseño del sticker (10×15 cm = 283×425 pts a 72dpi):

```
┌─────────────────────────────────────────────┐
│  [LOGO/NOMBRE EMPRESA]          [QR CODE]   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  DESTINATARIO                       │   │
│  │  Juan Carlos Pérez Rodríguez        │   │
│  │  Cra 15 #45-32 Apto 301            │   │
│  │  Barrio: El Prado                   │   │
│  │  Santa Marta, Magdalena             │   │
│  │  Tel: 300 123 4567                  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  De: Empresa XYZ S.A.S                     │
│  Guía: MAG-20260317-0042                   │
│  Fecha: 17/03/2026                         │
│  Peso: 1.5 kg                              │
│                                             │
│  ████████████████████████████████████████  │
│  (código de barras Code 128)               │
└─────────────────────────────────────────────┘
```

**GET /api/v1/etiquetas/:guia_id**
```
- Roles: admin, empresa (solo sus guías)
- Buscar guía en BD
- Generar QR del numero_guia con la librería qrcode (base64 PNG)
- Generar PDF con pdfkit (tamaño carta, una etiqueta por página o múltiples por hoja)
- Para código de barras: generar con bwip-js (Code 128)
- NO guardar en Storage en esta versión (generación on-the-fly)
- Headers: Content-Type: application/pdf, Content-Disposition: attachment; filename="MAG-XXXX.pdf"
- Stream del PDF directo al response
```

**POST /api/v1/etiquetas/bulk**
```
Body: { guia_ids: ["uuid1", "uuid2", ...] } — máximo 100
- Roles: admin, empresa (filtrar solo sus guías)
- Generar un PDF con TODAS las etiquetas (una por página)
- QR y código de barras para cada una
- Content-Disposition: attachment; filename="etiquetas-bulk-FECHA.pdf"
```

### Código de referencia para generar etiqueta con pdfkit:

```javascript
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

async function generarEtiquetaPDF(guia) {
  // Tamaño: 283 x 425 puntos = ~10x15 cm
  const doc = new PDFDocument({ size: [283, 425], margin: 10 });

  // QR Code (retorna buffer PNG)
  const qrBuffer = await QRCode.toBuffer(guia.numero_guia, { width: 80 });

  // Código de barras Code 128
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: guia.numero_guia,
    scale: 2,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });

  // Header: nombre empresa
  doc.fontSize(9).font('Helvetica-Bold')
     .text('Operaciones Logísticas del Magdalena', 10, 12, { width: 180 });

  // QR en esquina superior derecha
  doc.image(qrBuffer, 200, 8, { width: 70 });

  // Caja destinatario
  doc.rect(10, 55, 263, 95).stroke();
  doc.fontSize(7).font('Helvetica-Bold').text('DESTINATARIO', 14, 60);
  doc.fontSize(10).font('Helvetica-Bold')
     .text(guia.nombre_destinatario, 14, 72, { width: 255 });
  doc.fontSize(8).font('Helvetica')
     .text(guia.direccion_destinatario, 14, 90, { width: 255 });
  if (guia.barrio) doc.text(`Barrio: ${guia.barrio}`, 14, 110);
  doc.text(`${guia.ciudad_destino}`, 14, 122);
  doc.text(`Tel: ${guia.telefono_destinatario}`, 14, 134);

  // Info remitente y guía
  doc.fontSize(8).font('Helvetica')
     .text(`De: ${guia.nombre_remitente}`, 10, 160)
     .text(`Guía: ${guia.numero_guia}`, 10, 172, { font: 'Helvetica-Bold' })
     .text(`Fecha: ${new Date(guia.created_at).toLocaleDateString('es-CO')}`, 10, 184);
  if (guia.peso_kg) doc.text(`Peso: ${guia.peso_kg} kg`, 10, 196);

  // Código de barras en la parte inferior
  doc.image(barcodeBuffer, 10, 310, { width: 263, height: 60 });

  return doc;
}
```

---

## PASO 3 — FRONTEND: reemplazar páginas placeholder

### `src/services/api.js` — agregar métodos faltantes a guiasService:

```javascript
export const guiasService = {
  // ya existentes:
  listar:  (token, params = {}) => { ... },
  obtener: (token, id) => req('GET', `/guias/${id}`, null, token),
  crear:   (token, data) => req('POST', '/guias', data, token),
  editar:  (token, id, data) => req('PUT', `/guias/${id}`, data, token),
  asignar: (token, id, repId) => req('PATCH', `/guias/${id}/asignar`, { repartidor_id: repId }, token),
  // NUEVOS:
  eliminar: (token, id) => req('DELETE', `/guias/${id}`, null, token),
  bulkUpload: (token, file) => {
    const fd = new FormData();
    fd.append('archivo', file);
    return fetch(`${BASE}/guias/bulk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(r => r.json().then(d => r.ok ? d : Promise.reject(new Error(d.error))));
  },
};

export const etiquetasService = {
  descargar: (token, guiaId) => {
    // Descarga directa (blob)
    return fetch(`${BASE}/etiquetas/${guiaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      if (!r.ok) throw new Error('Error al generar etiqueta');
      return r.blob();
    });
  },
  bulk: (token, guiaIds) => {
    return fetch(`${BASE}/etiquetas/bulk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ guia_ids: guiaIds }),
    }).then(r => {
      if (!r.ok) throw new Error('Error al generar etiquetas');
      return r.blob();
    });
  },
};
```

### Función helper para descargar blob como archivo:
```javascript
export function descargarArchivo(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

### `src/pages/admin/AdminGuias.jsx` — implementación completa

Construir una página de gestión de guías con:

**Layout principal**: usar el componente `Layout` existente.

**Sección de filtros** (barra superior):
- Input de búsqueda (busca en numero_guia, nombre_destinatario, telefono)
- Select de estado (todos | registrado | asignado | en_ruta | entregado | no_contesto | reagendar | devuelto)
- DatePicker básico (input type="date") para fecha_desde y fecha_hasta
- Botón "Limpiar filtros"
- Botón "Nueva guía" (abre modal)
- Botón "Cargar Excel" (abre modal de carga masiva)
- Botón "Descargar seleccionadas" (descarga PDF bulk de guías seleccionadas con checkbox)

**Tabla de guías** con columnas:
- Checkbox de selección (para bulk)
- Número de guía (en bold, azul, clickeable para ver detalle)
- Destinatario + dirección (2 líneas)
- Ciudad
- Empresa (solo visible para admin)
- Repartidor asignado (o "Sin asignar" en gris)
- Estado (badge de color según estado)
- Fecha de registro
- Acciones: [Descargar etiqueta] [Asignar] [Editar] [Eliminar]

**Estados con colores** (badges):
```javascript
const estadoConfig = {
  registrado:           { label: 'Registrado',           color: 'bg-gray-100 text-gray-700' },
  asignado:             { label: 'Asignado',             color: 'bg-blue-100 text-blue-700' },
  en_ruta:              { label: 'En ruta',              color: 'bg-amber-100 text-amber-700' },
  entregado:            { label: 'Entregado',            color: 'bg-green-100 text-green-700' },
  no_contesto:          { label: 'No contestó',          color: 'bg-orange-100 text-orange-700' },
  direccion_incorrecta: { label: 'Dir. incorrecta',      color: 'bg-red-100 text-red-700' },
  reagendar:            { label: 'Reagendar',            color: 'bg-purple-100 text-purple-700' },
  devuelto:             { label: 'Devuelto',             color: 'bg-red-200 text-red-800' },
};
```

**Modal "Nueva guía"**:
- Formulario con todos los campos del modelo
- Admin ve un select de empresa (cargar empresas de /api/v1/usuarios?rol=empresa... o mejor: crear endpoint GET /api/v1/empresas)
- Empresa ve el formulario sin select de empresa (se asigna automáticamente en backend)
- Validación de campos requeridos en frontend antes de enviar
- Loading state en el botón
- Al crear exitosamente: cerrar modal, recargar tabla, mostrar mensaje de éxito

**Modal "Cargar Excel"**:
- Input file que acepta .xlsx y .csv
- Botón de descarga de plantilla (generar y descargar un Excel de muestra con las columnas correctas)
- Al seleccionar archivo: mostrar nombre y tamaño
- Botón "Importar"
- Mostrar resultado: "Se crearon X guías. Y errores." con detalle de errores si hay

**Modal "Asignar repartidor"**:
- Abre al hacer clic en "Asignar" en la fila
- Select de repartidores (cargar de GET /api/v1/usuarios?rol=repartidor)
- Botón confirmar

**Modal "Ver detalle"**:
- Muestra todos los datos de la guía
- Timeline del historial de estados (ordenado del más reciente al más antiguo)
- Botón "Descargar etiqueta"

**Paginación**: botones Anterior / Siguiente, mostrando "Página X de Y · Total: Z guías"

**Descarga de etiqueta individual**: al hacer clic en "Descargar etiqueta" → llama a `etiquetasService.descargar()` → usa `descargarArchivo()` para disparar la descarga del PDF.

**Descarga bulk**: checkboxes en la tabla → botón "Descargar seleccionadas (N)" → llama a `etiquetasService.bulk()`.

---

### `src/pages/empresa/EmpresaGuias.jsx` — misma interfaz sin columna empresa

Exactamente igual a `AdminGuias.jsx` pero:
- Sin columna "Empresa" en la tabla
- Sin selector de empresa en el modal de crear
- Sin botón "Asignar" (solo admin asigna)
- Sin botón "Eliminar"
- Los filtros no incluyen empresa_id (el backend la filtra automáticamente)
- Puede crear guías, descargar etiquetas y ver detalle/historial

---

## PASO 4 — BACKEND: endpoint de empresas (necesario para el select del admin)

Agregar en `src/routes/usuarios.js` (o crear `src/routes/empresas.js`):

```javascript
// GET /api/v1/empresas  — listar empresas activas
router.get('/empresas', verificarToken, checkRole(['admin']), async (req, res) => {
  const { data, error } = await supabase
    .from('empresas')
    .select('id, nombre, nit')
    .eq('activa', true)
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});
```

Registrar esta ruta en `index.js`:
```javascript
app.use('/api/v1/empresas', require('./routes/empresas'));
```

Y agregar al `api.js` del frontend:
```javascript
export const empresasService = {
  listar: (token) => req('GET', '/empresas', null, token),
};
```

---

## PASO 5 — COMPONENTE REUTILIZABLE: BadgeEstado

Crear `src/components/BadgeEstado.jsx`:
```jsx
const estadoConfig = { /* ... ver arriba ... */ };
export default function BadgeEstado({ estado }) {
  const cfg = estadoConfig[estado] || { label: estado, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
```

---

## CRITERIOS DE VERIFICACIÓN AL TERMINAR

1. `POST /api/v1/guias` crea una guía con número `MAG-YYYYMMDD-XXXX` único
2. `GET /api/v1/guias` con rol `empresa` solo devuelve las guías de esa empresa
3. `GET /api/v1/guias` con rol `admin` devuelve todas
4. `POST /api/v1/guias/bulk` con un Excel de 5 filas crea 5 guías
5. `GET /api/v1/etiquetas/:guia_id` devuelve un PDF descargable con QR y código de barras
6. `POST /api/v1/etiquetas/bulk` con 3 IDs devuelve un PDF con 3 etiquetas
7. En el frontend, el admin ve la tabla de guías con filtros funcionales
8. Crear una guía desde el formulario y que aparezca inmediatamente en la tabla
9. Descargar la etiqueta de esa guía desde la tabla
10. Cargar un Excel y que las guías aparezcan en la tabla

---

## INSTRUCCIONES PARA EL MODELO

1. Reemplaza completamente los placeholders de `guias.js` y `etiquetas.js` con código real
2. Crea el archivo `src/routes/empresas.js` y regístralo en `index.js`
3. Reemplaza `AdminGuias.jsx` y `EmpresaGuias.jsx` con implementaciones completas
4. Crea el componente `BadgeEstado.jsx`
5. Actualiza `api.js` con los nuevos métodos y servicios
6. Usa Tailwind para todos los estilos, consistente con el estilo de `AdminUsuarios.jsx`
7. Los modales deben ser overlays (fixed + backdrop blur o darkening)
8. Maneja siempre los estados de loading y error en el frontend
9. El código debe ser limpio, con nombres en español para variables de dominio
10. Al finalizar muestra el árbol de archivos modificados/creados

¡Implementa la Fase 2 completa!
