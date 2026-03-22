const supabase = require('../config/supabase');

const DEFAULT_TRACKING_BASE_URL = 'https://olmwebsite.vercel.app';
const DEFAULT_WHAPI_URL = 'https://gate.whapi.cloud/messages/text';

function getTrackingBaseUrl() {
  const envFrontend = String(process.env.FRONTEND_URL || '').trim();
  const isLocal = /localhost|127\.0\.0\.1/i.test(envFrontend);
  return (envFrontend && !isLocal ? envFrontend : DEFAULT_TRACKING_BASE_URL).replace(/\/$/, '');
}

function normalizePhone(value = '') {
  let tel = String(value || '').replace(/\D/g, '');
  if (!tel) return null;
  if (tel.startsWith('57')) return tel;
  if (tel.length === 10) return `57${tel}`;
  if (tel.length === 11 && tel.startsWith('0')) return `57${tel.slice(1)}`;
  return tel;
}

function persistNotification(row) {
  return supabase
    .from('notificaciones')
    .insert(row)
    .then(() => {})
    .catch(() => {});
}

function resolveWhapiUrl() {
  const raw = String(process.env.WHAPI_URL || '').trim();
  if (!raw) return DEFAULT_WHAPI_URL;
  const withoutSlash = raw.replace(/\/+$/, '');
  if (/\/messages\/text$/i.test(withoutSlash)) return withoutSlash;
  return `${withoutSlash}/messages/text`;
}

const mensajesEstado = {
  asignado:             (guia) => `📦 Hola ${guia.nombre_destinatario}, tu pedido *${guia.numero_guia}* ya tiene repartidor asignado. Pronto llegará a ${guia.ciudad_destino}.`,
  en_ruta:              (guia) => `🚚 Tu pedido *${guia.numero_guia}* está en camino. El repartidor se dirige a ${guia.direccion_destinatario}. Puedes rastrearlo en: ${getTrackingBaseUrl()}/rastrear/${guia.numero_guia}`,
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
  const generarMensaje = mensajesEstado[nuevoEstado];
  if (!generarMensaje) return;

  const tel = normalizePhone(guia.telefono_destinatario);
  if (!tel) return;

  const mensaje = generarMensaje(guia);

  if (!process.env.WHAPI_TOKEN) {
    console.log(`[WhatsApp SKIP] Sin WHAPI_TOKEN. guia=${guia.numero_guia} estado=${nuevoEstado} tel=${tel}`);
    persistNotification({
      guia_id: guia.id,
      tipo: 'whatsapp',
      destinatario_tel: tel,
      mensaje,
      estado_envio: 'fallido',
      enviado_at: new Date().toISOString(),
    });
    return;
  }

  const whapiUrl = resolveWhapiUrl();

  try {
    const response = await fetch(whapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
      },
      body: JSON.stringify({ to: tel + '@s.whatsapp.net', body: mensaje }),
    });

    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_e) {
      data = null;
    }

    const exito = Boolean(response.ok && (data?.sent === true || data?.message?.id));
    if (!exito) {
      console.error(`[WhatsApp FALLIDO] guia=${guia.numero_guia} estado=${nuevoEstado} status=${response.status} body=${raw}`);
    }

    persistNotification({
      guia_id: guia.id,
      tipo: 'whatsapp',
      destinatario_tel: tel,
      mensaje,
      estado_envio: exito ? 'enviado' : 'fallido',
      enviado_at: new Date().toISOString(),
    });

  } catch (err) {
    console.error(`[WhatsApp ERROR] guia=${guia.numero_guia} estado=${nuevoEstado}: ${err.message}`);
    persistNotification({
      guia_id: guia.id,
      tipo: 'whatsapp',
      destinatario_tel: tel,
      mensaje,
      estado_envio: 'fallido',
      enviado_at: new Date().toISOString(),
    });
    // No lanzar error — la notificación es best-effort
  }
}

module.exports = { enviarNotificacion };
