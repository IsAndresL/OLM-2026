# PROMPT — ACTUALIZAR DISEÑO DE ETIQUETAS DE ENVÍO
# Proyecto: Operaciones Logísticas del Magdalena
# Modelo: Claude Opus 4.6
# Tarea: Reemplazar el diseño de etiquetas PDF por el nuevo diseño moderno
# ─────────────────────────────────────────────────────────────

Eres un desarrollador full-stack senior. Tu tarea es actualizar el archivo
`backend/src/routes/etiquetas.js` para que las etiquetas PDF generadas
tengan un diseño moderno y profesional, acorde al estilo de Operaciones
Logísticas del Magdalena.

---

## CONTEXTO

El sistema ya genera etiquetas PDF con `pdfkit`. Necesitas reemplazar el
diseño actual por uno nuevo, moderno, con los campos del sistema reales.
El diseño de referencia es el siguiente (descrito en detalle más abajo).

---

## DISEÑO DE LA ETIQUETA (10 × 15 cm = 283 × 425 pts a 72dpi)

La etiqueta tiene **8 secciones de arriba hacia abajo**:

```
┌─────────────────────────────────────────────────────────┐
│  HEADER AZUL (#1D4ED8)                                  │
│  [LOGO OLM]  Operaciones Logísticas del Magdalena       │
│                              NÚMERO DE GUÍA             │
│                              MAG-20260317-0042           │
├─────────────────────────────────────────────────────────┤
│  DESTINATARIO (nombre grande 12pt bold)    [QR code]   │
│  Dirección · Barrio                                     │
│  Ciudad, Magdalena                                      │
│  [chip azul claro con teléfono]                         │
├─────────────────────────────────────────────────────────┤
│  [chip] DESCRIPCIÓN  [chip] PESO  [chip] ENTREGA EST.  │
├─────────────────────────────────────────────────────────┤
│  [BADGE NARANJA COD — solo si es_cod = true]            │
│  COBRO CONTRA ENTREGA · $85.000                         │
├─────────────────────────────────────────────────────────┤
│  DE │ X Cargo S.A.S · Juan García                       │
├─────────────────────────────────────────────────────────┤
│  ████████ CÓDIGO DE BARRAS Code128 ████████             │
│  M A G - 2 0 2 6 0 3 1 7 - 0 0 4 2                    │
├─────────────────────────────────────────────────────────┤
│  CIUDAD DESTINO │ BARRIO │ FECHA REGISTRO               │
└─────────────────────────────────────────────────────────┘
```

---

## ESPECIFICACIONES EXACTAS DE CADA SECCIÓN

### 1. HEADER AZUL
- Fondo: `#1D4ED8` · altura: ~18mm
- **Logo OLM**: a la izquierda, dentro de un cuadrado redondeado con fondo
  `rgba(255,255,255,0.2)`. Dentro del cuadrado dibujar con pdfkit el siguiente
  ícono de camión simplificado usando líneas y rectángulos blancos:
  - Rectángulo principal (cabina + carga): 12×6 pts, blanco
  - Rectángulo pequeño (cabina): 5×6 pts sobresaliendo a la derecha
  - 2 círculos pequeños (ruedas): radio 1.5 pts, centrados debajo
  Si dibujar el ícono es complejo con pdfkit, usar en su lugar la letra
  **"O"** en Helvetica-Bold blanca, tamaño 11pt, centrada en el cuadrado.
  Abajo del ícono/letra: texto "OLM" en bold blanco 8pt, luego en una segunda
  línea "Operaciones Logísticas del Magdalena" en 5.5pt color `#93C5FD`.
- **Número de guía**: alineado a la derecha del header.
  Arriba: "NÚMERO DE GUÍA" en 5pt `#93C5FD`.
  Abajo: el `numero_guia` en Helvetica-Bold 10pt blanco.

### 2. BLOQUE DESTINATARIO + QR
- Padding superior: 3mm desde el header
- **Label "DESTINATARIO"**: Helvetica-Bold 5pt, color `#9CA3AF`
- **Nombre**: Helvetica-Bold 12pt, color `#111827` — es el elemento más
  prominente de toda la etiqueta, debe verse de un vistazo
- **Dirección**: Helvetica 7pt, color `#374151`, dos líneas:
  línea 1: `direccion_destinatario`
  línea 2: `Barrio {barrio}` (si `barrio` existe)
- **Ciudad**: Helvetica-Bold 7.5pt, color `#111827`:
  `{ciudad_destino}, Magdalena`
- **Chip teléfono**: rectángulo redondeado (radio 1.5mm), fondo `#E6F1FB`,
  sin borde. Dentro: `{telefono_destinatario}` en Helvetica-Bold 6.5pt
  color `#1D4ED8`
- **QR code** (a la derecha, 22×22mm):
  Usar la librería `qrcode` de Node o generar el QR con bwip-js que ya está
  instalado. El contenido del QR es la URL de tracking:
  `${process.env.FRONTEND_URL}/rastrear/${guia.numero_guia}`
  Dibujarlo como imagen PNG embebida en el PDF.
  Debajo del QR: "rastrear envío" en 5pt `#9CA3AF` centrado.

### 3. CHIPS DE INFO (3 tarjetas en fila)
- Fondo de cada chip: `#F9FAFB`, radio 1.5mm, sin borde
- Ancho: un tercio del ancho interno menos gaps
- Altura: 9mm
- Contenido de cada chip:
  - Línea 1 (label): 4.5pt Helvetica-Bold `#9CA3AF`
  - Línea 2 (valor): 7pt Helvetica-Bold `#111827`
- Chips: `DESCRIPCIÓN` → `descripcion_paquete`,
         `PESO` → `{peso_kg} kg`,
         `ENTREGA EST.` → `fecha_estimada_entrega` (formateada como "18 mar 2026",
           si es null mostrar "Por confirmar")

### 4. BADGE COD (solo si `guia.es_cod === true`)
- Fondo: `#FFF7ED`, borde 0.3pt `#FED7AA`, radio 2mm
- A la izquierda: círculo relleno naranja `#F97316`, radio 1.8mm
- Texto línea 1: "COBRO CONTRA ENTREGA (COD)" en 5pt Helvetica-Bold `#9A3412`
- Texto línea 2: `${monto_cod}` formateado en pesos COP, 10pt Helvetica-Bold
  color `#C2410C` (ej. "$85.000")
- Si `es_cod === false` → no renderizar esta sección (no dejar espacio vacío)

### 5. REMITENTE
- Fondo: `#F9FAFB`, radio 1.5mm
- Label "DE" en 4.5pt Helvetica-Bold `#9CA3AF`
- Línea separadora vertical entre label y datos
- Primera línea: `empresa_aliada.nombre` o `nombre_remitente` en 7pt
  Helvetica-Bold `#111827`
- Segunda línea: `nombre_remitente` en 6pt Helvetica `#6B7280`

### 6. CÓDIGO DE BARRAS
- Separador horizontal fino antes del barcode
- Generar Code128 real con `bwip-js` (ya instalado en el backend):
  ```javascript
  const bwipjs = require('bwip-js');
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid:        'code128',
    text:        guia.numero_guia,
    scale:       2,
    height:      12,
    includetext: false,
  });
  ```
  Embeber como imagen PNG centrada. Ancho máximo: área interna de la etiqueta.
- Debajo del barcode: el `numero_guia` con espacios entre caracteres en 5.5pt
  Helvetica-Bold `#374151`, centrado

### 7. FOOTER (franja gris al fondo)
- Fondo: `#F9FAFB`, altura: 10mm
- Separadores verticales delgados entre columnas
- **3 columnas** (NO incluir zona de reparto):
  - Col 1: valor = `ciudad_destino`, label = "CIUDAD DESTINO"
  - Col 2: valor = `barrio` (o "—" si vacío), label = "BARRIO"
  - Col 3: valor = `created_at` formateado como "DD/MM/YYYY", label = "FECHA REGISTRO"
- Valor en 7pt Helvetica-Bold `#111827`, label en 4.5pt Helvetica `#9CA3AF`
- Todo centrado en cada columna

### 8. BORDE EXTERIOR
- Borde redondeado alrededor de toda la etiqueta: 0.5pt `#E5E7EB`, radio 3mm

---

## FORMATO DEL CÓDIGO DE MONEDA COLOMBIANA

```javascript
function formatCOP(monto) {
  if (!monto) return '$0';
  return '$' + Number(monto).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}
```

---

## FORMATO DE FECHA

```javascript
function formatFechaCorta(fechaStr) {
  if (!fechaStr) return 'Por confirmar';
  const d = new Date(fechaStr);
  const meses = ['ene','feb','mar','abr','may','jun',
                 'jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}
```

---

## ESTRUCTURA DEL ARCHIVO `etiquetas.js`

Mantener la misma estructura de rutas existente:

### GET /api/v1/etiquetas/:guia_id
```javascript
// 1. Buscar la guía en Supabase con join a empresas
const { data: guia } = await supabase
  .from('guias')
  .select('*, empresas(nombre)')
  .eq('id', req.params.guia_id)
  .single();

// 2. Verificar que la guía pertenece a la empresa del usuario (si es rol empresa)

// 3. Generar PDF con el nuevo diseño

// 4. Streamear el PDF como response:
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition',
  `attachment; filename="${guia.numero_guia}.pdf"`);
doc.pipe(res);
doc.end();
```

### POST /api/v1/etiquetas/bulk
```javascript
// Recibe: { guia_ids: ["uuid1", "uuid2", ...] }
// Genera UN solo PDF con todas las etiquetas, una por página (una = una hoja de 10×15cm)
// Máximo 100 guías por petición
```

---

## DEPENDENCIAS

Las siguientes ya están instaladas en el backend, úsalas:
- `pdfkit` — generación de PDF
- `bwip-js` — código de barras Code128
- `qrcode` — si no está instalado, instalar con `npm install qrcode`

---

## CAMPOS DEL OBJETO `guia` DISPONIBLES

```javascript
{
  id, numero_guia,
  nombre_remitente,
  nombre_destinatario, telefono_destinatario,
  direccion_destinatario, ciudad_destino, barrio,
  descripcion_paquete, peso_kg, valor_declarado,
  es_cod, monto_cod,
  fecha_estimada_entrega,
  empresa_id,
  empresas: { nombre },  // join con tabla empresas
  created_at
}
```

---

## LO QUE NO DEBE APARECER EN LA ETIQUETA

- **NO incluir zona de reparto** — no existe el footer de zona
- NO incluir valor declarado
- NO incluir observaciones internas
- NO incluir repartidor_id ni datos del repartidor

---

## INSTRUCCIONES PARA EL MODELO

1. Reemplazar **completamente** el contenido actual de `backend/src/routes/etiquetas.js`
2. Implementar el nuevo diseño exactamente como se describe en las 8 secciones
3. Usar `bwip-js` para el código de barras Code128 real
4. Usar `qrcode` para el QR (instalar si es necesario: `npm install qrcode`)
5. El QR debe contener la URL de tracking completa con `process.env.FRONTEND_URL`
6. El badge COD debe ser **condicional**: solo se renderiza si `guia.es_cod === true`
7. El footer tiene **exactamente 3 columnas** (ciudad, barrio, fecha — sin zona)
8. Usar las funciones `formatCOP()` y `formatFechaCorta()` para formatear valores
9. En el bulk PDF, cada guía ocupa una página independiente de 10×15cm
10. Mantener exactamente los mismos endpoints y firmas de función que existen hoy
11. El archivo final debe funcionar sin ningún cambio en `index.js`
12. Probar mentalmente que el código genera el PDF sin errores antes de entregarlo

¡Implementa el nuevo diseño de etiquetas!
