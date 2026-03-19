const supabase = require('../config/supabase');

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
