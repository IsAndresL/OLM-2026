const express = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole } = require('../middlewares/auth');
const router = express.Router();

// GET /api/v1/tracking/:numero_guia
router.get('/:numero_guia', async (req, res) => {
  const { numero_guia } = req.params;

  try {
    // Buscar la guía (case-insensitive)
    const { data: guia, error: guiaError } = await supabase
      .from('guias')
      .select('id, numero_guia, nombre_destinatario, direccion_destinatario, ciudad_destino, estado_actual, created_at, repartidor_id')
      .ilike('numero_guia', numero_guia.trim())
      .single();

    if (guiaError || !guia) {
      return res.status(404).json({ error: 'Número de guía no encontrado. Verifica que sea correcto.' });
    }

    // Obtener el historial
    const { data: historial, error: historialError } = await supabase
      .from('historial_estados')
      .select('estado, created_at')
      .eq('guia_id', guia.id)
      .order('created_at', { ascending: false });

    if (historialError) {
      throw historialError;
    }

    const mensajes = {
      registrado: "Tu paquete fue registrado en nuestro sistema",
      asignado: "Tu paquete fue asignado a un repartidor",
      en_ruta: "Tu paquete está en camino 🚚",
      entregado: "¡Tu paquete fue entregado exitosamente! ✅",
      no_contesto: "Intentamos entregar tu paquete pero no hubo respuesta",
      direccion_incorrecta: "Tuvimos un problema con la dirección de entrega",
      reagendar: "Tu entrega fue reprogramada",
      devuelto: "Tu paquete fue devuelto al remitente",
    };

    // Formatear historial público
    const historialPublico = historial.map(h => {
      const date = new Date(h.created_at);
      return {
        estado: h.estado,
        mensaje: mensajes[h.estado] || h.estado,
        fecha: date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }),
        hora: date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      };
    });

    // Si la guía recién se registra pero no tiene historial aún (por safety net)
    if (historialPublico.length === 0) {
        const date = new Date(guia.created_at);
        historialPublico.push({
            estado: guia.estado_actual,
            mensaje: mensajes[guia.estado_actual] || guia.estado_actual,
            fecha: date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }),
            hora: date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        });
    }

    return res.json({
      numero_guia: guia.numero_guia,
      nombre_destinatario: guia.nombre_destinatario,
      direccion_destinatario: guia.direccion_destinatario,
      ciudad_destino: guia.ciudad_destino,
      repartidor_id: guia.repartidor_id,
      estado_actual: guia.estado_actual,
      historial: historialPublico
    });

  } catch (error) {
    console.error('Error tracking:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
