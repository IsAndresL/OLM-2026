# PROMPT COMPLETO — FASE 3
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6 (via Antigravity o Claude Code)
# Fase: 3 · App repartidor + Tracking público + Notificaciones WhatsApp
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior continuando el desarrollo del sistema
**Operaciones Logísticas del Magdalena**. Las Fases 1 y 2 ya están completas:
autenticación JWT por roles, CRUD de guías, etiquetas PDF, y la interfaz del
administrador y empresa funcionando.

---

## CONTEXTO DEL PROYECTO

Sistema de gestión logística de última milla para Colombia. Roles:
- `admin` — acceso total ✅ (Fases 1 y 2)
- `empresa` — ve y gestiona sus guías ✅ (Fases 1 y 2)
- `repartidor` — ve sus guías del día y marca estados ⚠️ **ESTA FASE**
- cliente final — rastreo público sin login ⚠️ **ESTA FASE**

Stack: **React + Vite + Tailwind** (frontend) | **Node.js + Express** (backend)
| **Supabase PostgreSQL + Storage** (datos)

---

## ESTRUCTURA EXISTENTE (Fases 1 y 2 completadas)

```
operaciones-magdalena/
├── backend/src/
│   ├── index.js                  ✅
│   ├── config/supabase.js        ✅
│   ├── middlewares/auth.js       ✅ verificarToken + checkRole
│   └── routes/
│       ├── auth.js               ✅ login / logout / me
│       ├── guias.js              ✅ CRUD completo + historial_estados
│       ├── etiquetas.js          ✅ PDF + QR + barcode
│       ├── usuarios.js           ✅ CRUD
│       ├── empresas.js           ✅ listar empresas
│       ├── repartidor.js         ⚠️  PLACEHOLDER — implementar ahora
│       └── tracking.js           ⚠️  PLACEHOLDER — implementar ahora
└── frontend/src/
    ├── services/api.js           ✅ authService, guiasService, etiquetasService...
    ├── context/AuthContext.jsx   ✅ user / token / rol
    ├── components/
    │   ├── Layout.jsx            ✅ sidebar + header
    │   └── BadgeEstado.jsx       ✅ badge de colores por estado
    └── pages/
        ├── admin/AdminGuias.jsx        ✅ tabla + modales
        ├── empresa/EmpresaGuias.jsx    ✅ tabla + modales
        ├── repartidor/RepartidorGuias.jsx ⚠️  PLACEHOLDER — implementar ahora
        └── public/TrackingPage.jsx     ⚠️  PLACEHOLDER — implementar ahora
```

---

## MODELO DE DATOS RELEVANTE PARA ESTA FASE

```sql
-- Tabla: guias (campos clave para el repartidor)
id, numero_guia, repartidor_id FK→usuarios,
estado_actual ('registrado','asignado','en_ruta','entregado',
  'no_contesto','direccion_incorrecta','reagendar','devuelto'),
nombre_destinatario, telefono_destinatario,
direccion_destinatario, ciudad_destino, barrio,
descripcion_paquete, peso_kg, created_at

-- Tabla: historial_estados
id, guia_id FK→guias, estado, nota, usuario_id FK→usuarios,
foto_evidencia_url, created_at

-- Tabla: notificaciones
id, guia_id FK→guias, tipo ('whatsapp','sms','email'),
destinatario_tel, mensaje, estado_envio ('pendiente','enviado','fallido'),
enviado_at
```

---

## LO QUE DEBES IMPLEMENTAR EN FASE 3

### OBJETIVO GENERAL
Al terminar esta fase:
1. El **repartidor** puede ver su lista de guías del día desde el celular, marcar
   el estado de cada entrega, agregar notas, y tomar foto como evidencia.
2. El **cliente final** puede consultar el estado de su paquete desde la web
   pública ingresando el número de guía.
3. El sistema envía **notificaciones WhatsApp automáticas** al cliente cuando
   cambia el estado de su guía.

---

## PASO 1 — BACKEND: `src/routes/repartidor.js` (reemplazar placeholder)

### GET /api/v1/repartidor/mis-guias
```
Rol requerido: repartidor
Query params: ?fecha=YYYY-MM-DD (default: hoy) &estado=asignado|en_ruta (default: activos)

Lógica:
1. repartidor_id = req.user.id (del JWT, no del body)
2. Filtrar por repartidor_id y fecha del created_at (o fecha de asignación)
3. Estados "activos" = asignado, en_ruta, no_contesto, reagendar
   (excluir entregado, devuelto)
4. Ordenar: primero los en_ruta, luego asignado, luego otros

Respuesta:
[{
  id, numero_guia, estado_actual,
  nombre_destinatario, telefono_destinatario,
  direccion_destinatario, ciudad_destino, barrio,
  descripcion_paquete, peso_kg,
  ultimo_estado: { estado, nota, created_at }  // último historial
}]
```

### POST /api/v1/repartidor/guias/:guia_id/estado
```
Rol requerido: repartidor
Body: { estado, nota?, foto_evidencia_url? }

Validaciones:
- La guía debe estar asignada a este repartidor (req.user.id)
- Solo puede cambiar a estos estados desde su app:
  en_ruta, entregado, no_contesto, direccion_incorrecta, reagendar
- No puede cambiar a: registrado, asignado, devuelto (solo admin)
- Si estado = 'entregado' o 'no_contesto' → nota es requerida (forzar confirmación)

Lógica (TRANSACCIÓN — todo o nada):
1. Verificar que guia.repartidor_id === req.user.id
2. Verificar que el estado nuevo es válido desde el estado actual
3. UPDATE guias SET estado_actual = $estado WHERE id = $guia_id
4. INSERT INTO historial_estados (guia_id, estado, nota, usuario_id, foto_evidencia_url)
5. Si tiene número de teléfono del destinatario → encolar notificación WhatsApp
6. Responder: { guia_id, nuevo_estado, historial_id }
```

### POST /api/v1/repartidor/evidencia/:guia_id
```
Rol requerido: repartidor
Body: multipart/form-data, campo "foto" (jpg/png/webp, max 5MB)

Lógica:
1. Verificar que la guía pertenece a este repartidor
2. Subir imagen a Supabase Storage:
   - Bucket: "evidencias" (crear si no existe, con política pública de lectura)
   - Path: evidencias/{guia_id}/{timestamp}.{ext}
3. Responder: { foto_url: "https://..." }

Código de referencia para subir a Supabase Storage:
const { data, error } = await supabase.storage
  .from('evidencias')
  .upload(path, fileBuffer, { contentType: mimetype, upsert: false });
const { data: { publicUrl } } = supabase.storage
  .from('evidencias').getPublicUrl(path);
```

---

## PASO 2 — BACKEND: `src/routes/tracking.js` (reemplazar placeholder)

### GET /api/v1/tracking/:numero_guia
```
Sin autenticación. Rate limit: 30 req/min por IP (ya está en el placeholder,
mantener el middleware de rateLimit existente).

Lógica:
1. Buscar guía por numero_guia (case-insensitive con ilike)
2. Si no existe: 404 { error: 'Número de guía no encontrado' }
3. Si existe: devolver SOLO los campos seguros para el público:

Respuesta PÚBLICA (nunca exponer empresa_id, repartidor_id, valor_declarado,
observaciones internas, ni datos de otras guías):
{
  numero_guia,
  nombre_destinatario,
  ciudad_destino,
  estado_actual,
  fecha_estimada_entrega,  // nullable
  historial: [
    {
      estado,
      mensaje: "Tu paquete fue registrado en el sistema",  // mensaje amigable
      fecha: "17 mar 2026",   // fecha formateada en español
      hora: "14:35"
    }
  ]
}

Mensajes amigables por estado:
const mensajes = {
  registrado:           "Tu paquete fue registrado en nuestro sistema",
  asignado:             "Tu paquete fue asignado a un repartidor",
  en_ruta:              "Tu paquete está en camino 🚚",
  entregado:            "¡Tu paquete fue entregado exitosamente! ✅",
  no_contesto:          "Intentamos entregar tu paquete pero no hubo respuesta",
  direccion_incorrecta: "Tuvimos un problema con la dirección de entrega",
  reagendar:            "Tu entrega fue reprogramada",
  devuelto:             "Tu paquete fue devuelto al remitente",
};
```

---

## PASO 3 — BACKEND: Servicio de notificaciones WhatsApp

Crear `src/services/whatsappService.js`:

```javascript
// src/services/whatsappService.js
// Usa Whapi.cloud (configurado en .env como WHAPI_TOKEN y WHAPI_URL)
// Si no hay token configurado, solo logear sin fallar (modo desarrollo)

const mensajesEstado = {
  asignado:             (guia) => `📦 Hola ${guia.nombre_destinatario}, tu pedido *${guia.numero_guia}* ya tiene repartidor asignado. Pronto llegará a ${guia.ciudad_destino}.`,
  en_ruta:              (guia) => `🚚 Tu pedido *${guia.numero_guia}* está en camino. El repartidor se dirige a ${guia.direccion_destinatario}. Puedes rastrearlo en: ${process.env.FRONTEND_URL}/rastrear/${guia.numero_guia}`,
  entregado:            (guia) => `✅ ¡Tu pedido *${guia.numero_guia}* fue entregado exitosamente! Gracias por confiar en Operaciones Logísticas del Magdalena.`,
  no_contesto:          (guia) => `📵 Intentamos entregar tu pedido *${guia.numero_guia}* pero no encontramos a nadie. Nos comunicaremos contigo para coordinar una nueva entrega.`,
  direccion_incorrecta: (guia) => `⚠️ Tuvimos un problema con la dirección de entrega de tu pedido *${guia.numero_guia}*. Por favor contáctanos para corregirla.`,
  reagendar:            (guia) => `📅 Tu entrega del pedido *${guia.numero_guia}* fue reprogramada. Pronto nos comunicaremos con la nueva fecha.`,
  devuelto:             (guia) => `↩️ Tu pedido *${guia.numero_guia}* fue devuelto. Por favor contacta al remitente para más información.`,
};

// Estados que NO disparan notificación al cliente:
const NO_NOTIFICAR = ['registrado'];

async function enviarNotificacion(guia, nuevoEstado) {
  if (NO_NOTIFICAR.includes(nuevoEstado)) return;
  if (!guia.telefono_destinatario) return;
  if (!process.env.WHAPI_TOKEN) {
    console.log(`[WhatsApp DEV] → ${guia.telefono_destinatario}: ${nuevoEstado}`);
    return;
  }

  const generarMensaje = mensajesEstado[nuevoEstado];
  if (!generarMensaje) return;

  const mensaje = generarMensaje(guia);
  // Normalizar teléfono colombiano: quitar espacios, guiones, +57
  let tel = guia.telefono_destinatario.replace(/\D/g, '');
  if (tel.startsWith('57')) tel = tel; // ya tiene código de país
  else if (tel.length === 10) tel = '57' + tel; // número local colombiano

  try {
    const response = await fetch(process.env.WHAPI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
      },
      body: JSON.stringify({ to: tel + '@s.whatsapp.net', body: mensaje }),
    });

    const data = await response.json();
    const exito = response.ok && data.sent;

    // Registrar en tabla notificaciones (sin await — no bloquear la respuesta)
    const supabase = require('../config/supabase');
    supabase.from('notificaciones').insert({
      guia_id: guia.id,
      tipo: 'whatsapp',
      destinatario_tel: tel,
      mensaje,
      estado_envio: exito ? 'enviado' : 'fallido',
      enviado_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});

  } catch (err) {
    console.error('[WhatsApp ERROR]', err.message);
    // No lanzar error — la notificación es best-effort
  }
}

module.exports = { enviarNotificacion };
```

**Integrar en `guias.js` (cuando admin/empresa cambia estado) y en `repartidor.js`**:
```javascript
const { enviarNotificacion } = require('../services/whatsappService');
// Después de actualizar estado y crear historial:
enviarNotificacion(guia, nuevoEstado); // sin await — best-effort
```

---

## PASO 4 — FRONTEND: App del repartidor (PWA móvil)

### `src/pages/repartidor/RepartidorGuias.jsx` — implementación completa

Esta página debe estar **optimizada para móvil**. El repartidor la abre desde el
navegador de su celular. Debe funcionar bien en pantallas de 360–414px de ancho.

**Diseño general:**
- Usa el `Layout` existente pero con un header simplificado (sin sidebar, solo header)
- Alternativamente: crear un `LayoutMovil.jsx` simplificado sin sidebar,
  con solo el logo, nombre del usuario, y botón de logout en el header.
  El contenido ocupa toda la pantalla.

**Vista principal — lista de entregas del día:**

```
┌─────────────────────────────────────────────┐
│  OLM  |  Mis entregas hoy (8)    [Logout]  │
├─────────────────────────────────────────────┤
│  [En ruta: 3]  [Asignadas: 4]  [Listas: 1] │ ← resumen rápido
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐   │
│  │ 🟡 EN RUTA    MAG-20260317-0012    │   │
│  │  Juan Pérez Rodríguez              │   │
│  │  Cra 5 #14-32, Barrio El Prado     │   │
│  │  📞 300 123 4567  [Llamar]         │   │
│  │  [Ver detalle]  [Marcar estado]    │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ 🔵 ASIGNADA   MAG-20260317-0015    │   │
│  │  María García López                │   │
│  │  Cl 22 #7-45, Centro               │   │
│  │  📞 315 987 6543  [Llamar]         │   │
│  │  [Ver detalle]  [Marcar estado]    │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Card de entrega — campos visibles:**
- Badge del estado actual (colores del BadgeEstado)
- Número de guía (pequeño, gris)
- Nombre del destinatario (grande, bold)
- Dirección + barrio
- Botón "Llamar" (enlace `tel:` con el teléfono del destinatario)
- Botón "Ver detalle" → abre panel/modal de detalle
- Botón "Marcar estado" → abre modal de cambio de estado

**Modal "Marcar estado"** (ocupa ~80% de la pantalla en móvil):
```
Opciones según estado actual:
- Si está "asignado":
    [✅ Salir a ruta] → cambia a en_ruta
- Si está "en_ruta":
    [✅ Entregado]          → requiere nota y foto opcional
    [📵 No contestó]       → requiere nota
    [🏠 Dirección incorrecta] → requiere nota
    [📅 Reagendar]         → requiere nota
- Si es no_contesto o reagendar:
    [✅ Entregado]          → requiere nota
    [📵 No contestó (2do)] → requiere nota
```

**Formulario dentro del modal:**
- Textarea para la nota (obligatoria en la mayoría de estados)
- Botón para tomar foto (input type="file" accept="image/*" capture="environment")
  → al seleccionar: subir a `/api/v1/repartidor/evidencia/:guia_id` → obtener URL → usar en el POST de estado
- Preview de la foto antes de confirmar (img con object-cover)
- Botón "Confirmar" con loading state
- Mostrar error si algo falla

**Panel "Ver detalle"** (slide-in desde abajo o modal):
- Todos los datos del destinatario
- Descripción del paquete y peso si están disponibles
- Timeline del historial de estados (más reciente arriba)
- Botón "Navegar" → enlace a Google Maps con la dirección
  (`https://maps.google.com/?q=DIRECCION+CIUDAD`)

**UX importante para móvil:**
- Botones grandes (min-height: 44px)
- Texto legible sin zoom (mínimo 14px)
- Toque táctil con áreas grandes
- Feedback inmediato (loading states)
- No usar hover (en móvil no hay hover)

**Carga de datos:**
- Al montar el componente: `GET /api/v1/repartidor/mis-guias`
- Mostrar skeleton loader mientras carga
- Botón de recarga manual ("Actualizar")
- Auto-refresh cada 2 minutos (opcional, con clearInterval en cleanup)

---

## PASO 5 — FRONTEND: Portal público de rastreo

### `src/pages/public/TrackingPage.jsx` — implementación completa

Esta página es **completamente pública** (sin auth), accesible en `/rastrear` y
`/rastrear/:numero`. Es la que los clientes finales visitan para ver su paquete.

**Diseño:**

```
┌─────────────────────────────────────────────────┐
│   [LOGO OLM]  Operaciones Logísticas del       │
│               Magdalena                         │
├─────────────────────────────────────────────────┤
│                                                 │
│   Rastrea tu envío                              │
│                                                 │
│   ┌─────────────────────────────┐  [Buscar]   │
│   │  MAG-20260317-0042          │              │
│   └─────────────────────────────┘              │
│                                                 │
│   ─────────────────────────────────────────    │
│                                                 │
│   📦 Pedido: MAG-20260317-0042                 │
│   Para: Juan Carlos Pérez                      │
│   Ciudad: Santa Marta                          │
│                                                 │
│   Estado actual:                               │
│   ┌─────────────────────────────────────────┐  │
│   │   🚚 EN RUTA                            │  │
│   │   Tu paquete está en camino             │  │
│   └─────────────────────────────────────────┘  │
│                                                 │
│   Historial:                                   │
│   ● 17 mar 2026, 14:35  En ruta               │
│     Tu paquete está en camino 🚚              │
│   ○ 17 mar 2026, 09:10  Asignado              │
│     Tu paquete fue asignado a un repartidor   │
│   ○ 16 mar 2026, 18:22  Registrado            │
│     Tu paquete fue registrado en el sistema   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Comportamiento:**
- Si la URL es `/rastrear/:numero` → pre-llenar el input y buscar automáticamente al montar
- Si la URL es `/rastrear` → mostrar el formulario vacío
- Al buscar: llamar a `GET /api/v1/tracking/:numero_guia`
- Loading state durante la búsqueda
- Error si no se encuentra: "Número de guía no encontrado. Verifica que sea correcto."
- El historial se muestra como timeline vertical (punto + línea conectora)
- El estado actual tiene un badge grande y prominente
- No mostrar ningún dato interno (empresa, repartidor, costos)

**Responsive:** funciona en móvil y desktop.

**Sin header de navegación autenticada** — solo el logo y nombre de la empresa.

---

## PASO 6 — FRONTEND: actualizar `api.js`

Agregar los servicios nuevos:

```javascript
// Repartidor
export const repartidorService = {
  misGuias: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/repartidor/mis-guias${qs ? '?'+qs : ''}`, null, token);
  },
  cambiarEstado: (token, guiaId, data) =>
    req('POST', `/repartidor/guias/${guiaId}/estado`, data, token),
  subirEvidencia: (token, guiaId, file) => {
    const fd = new FormData();
    fd.append('foto', file);
    return fetch(`${BASE}/repartidor/evidencia/${guiaId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(r => r.json().then(d => r.ok ? d : Promise.reject(new Error(d.error))));
  },
};

// Tracking público
export const trackingService = {
  consultar: (numeroGuia) => req('GET', `/tracking/${numeroGuia.trim().toUpperCase()}`),
};
```

---

## PASO 7 — FRONTEND: LayoutMovil.jsx (nuevo componente)

Crear `src/components/LayoutMovil.jsx` para el repartidor:

```jsx
// Header simple sin sidebar
// - Logo + "OLM" a la izquierda
// - Nombre del usuario en el centro (truncado)
// - Botón logout a la derecha
// - Contenido: {children} ocupa todo el ancho
// No tiene sidebar. Pensado para móvil.
```

---

## PASO 8 — CONFIGURAR SUPABASE STORAGE

Agregar instrucciones comentadas en el código o en un archivo `SETUP.md`:

```
Para que la subida de fotos de evidencia funcione, debes crear el bucket
en Supabase:
1. Ve a Supabase → Storage → New bucket
2. Nombre: "evidencias"
3. Public bucket: SÍ (para que las URLs sean accesibles)
4. Allowed MIME types: image/jpeg, image/png, image/webp
5. Max file size: 5MB
```

---

## CRITERIOS DE VERIFICACIÓN AL TERMINAR

**Backend repartidor:**
1. `GET /api/v1/repartidor/mis-guias` con token de repartidor devuelve solo SUS guías activas del día
2. `POST /api/v1/repartidor/guias/:id/estado` con `{ estado: 'en_ruta', nota: 'Saliendo' }` actualiza la guía y crea historial
3. Intentar cambiar el estado de una guía de OTRO repartidor devuelve 403
4. `POST /api/v1/repartidor/evidencia/:id` sube una imagen y devuelve la URL pública
5. El servicio de WhatsApp loguea en consola si no hay token configurado (no crashea)

**Backend tracking:**
6. `GET /api/v1/tracking/MAG-20260317-0042` devuelve estado + historial con mensajes amigables
7. `GET /api/v1/tracking/MAG-NOEXISTE` devuelve 404
8. El endpoint NO devuelve empresa_id, repartidor_id, valor_declarado

**Frontend repartidor:**
9. El repartidor ve su lista de guías al hacer login
10. Puede marcar una guía como "En ruta" y la tarjeta actualiza el estado inmediatamente
11. Puede agregar una nota y subir foto al marcar "Entregado"
12. El botón "Llamar" abre el marcador del teléfono en el celular
13. El botón "Navegar" abre Google Maps con la dirección

**Frontend tracking público:**
14. Ir a `/rastrear/MAG-20260317-0042` muestra el estado y el historial
15. Un número inválido muestra el mensaje de error
16. La página funciona bien en móvil (texto legible sin zoom)

---

## INSTRUCCIONES PARA EL MODELO

1. **Reemplaza completamente** los placeholders de `repartidor.js` y `tracking.js`
2. **Crea** `src/services/whatsappService.js` e intégralo en `repartidor.js` y en
   el endpoint de cambio de estado de `guias.js` (PATCH /:id/asignar ya dispara
   notificación, y POST /:id/estados también)
3. **Implementa** `RepartidorGuias.jsx` con diseño mobile-first
4. **Implementa** `TrackingPage.jsx` como portal público responsive
5. **Crea** `LayoutMovil.jsx` para el repartidor (sin sidebar)
6. **Actualiza** `api.js` con los nuevos servicios
7. **Configura** multer en `repartidor.js` para recibir fotos (igual que en `guias.js` para bulk)
8. **Usa Tailwind** para todos los estilos, mobile-first (sm: breakpoints)
9. Los botones de acción del repartidor deben tener `min-h-[44px]` para ser táctiles
10. El modal de "Marcar estado" debe ocupar la parte inferior de la pantalla en móvil
    (bottom sheet: `fixed bottom-0 left-0 right-0 rounded-t-2xl`)
11. Al finalizar muestra el árbol de archivos modificados/creados y los pasos
    manuales que el desarrollador debe hacer en Supabase (crear bucket)

¡Implementa la Fase 3 completa!
