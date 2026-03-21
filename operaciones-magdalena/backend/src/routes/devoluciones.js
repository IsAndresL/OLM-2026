const express = require('express');
const supabase = require('../config/supabase');
const { verificarToken, checkRole, checkAdminPermission } = require('../middlewares/auth');

const router = express.Router();
const MOTIVOS = ['no_contesto', 'direccion_incorrecta', 'rechazo_cliente', 'paquete_danado', 'direccion_no_existe', 'otro'];
const ESTADOS = ['en_bodega', 'en_retorno', 'devuelto_remitente', 'descartado'];

function dayStart(fecha) {
  return `${fecha}T00:00:00`;
}

function dayEnd(fecha) {
  return `${fecha}T23:59:59`;
}

function parseBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

router.post('/', verificarToken, checkRole(['admin']), checkAdminPermission('devoluciones.manage'), async (req, res) => {
  try {
    const {
      guia_id: guiaId,
      motivo,
      descripcion,
      foto_paquete_url: fotoPaqueteUrl,
      crear_guia_retorno: crearGuiaRetorno,
    } = req.body || {};

    if (!guiaId || !motivo) {
      return res.status(400).json({ error: 'guia_id y motivo son requeridos' });
    }

    if (!MOTIVOS.includes(motivo)) {
      return res.status(400).json({ error: 'motivo no valido' });
    }

    const { data: guia, error: guiaError } = await supabase
      .from('guias')
      .select('id, numero_guia, empresa_id, repartidor_id, estado_actual, nombre_remitente, nombre_destinatario, direccion_destinatario, ciudad_destino, barrio, telefono_destinatario, descripcion_paquete, peso_kg, valor_declarado, observaciones')
      .eq('id', guiaId)
      .single();

    if (guiaError || !guia) return res.status(404).json({ error: 'Guia no encontrada' });
    if (guia.estado_actual !== 'devuelto') {
      return res.status(409).json({ error: 'Solo se pueden registrar devoluciones de guias en estado devuelto' });
    }

    let guiaRetornoId = null;

    if (parseBool(crearGuiaRetorno)) {
      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .select('nombre, direccion, ciudad')
        .eq('id', guia.empresa_id)
        .maybeSingle();

      if (empresaError) return res.status(500).json({ error: empresaError.message });

      const { data: numeroRetorno, error: numeroError } = await supabase.rpc('generar_numero_guia');
      if (numeroError) return res.status(500).json({ error: numeroError.message });

      const payloadRetorno = {
        numero_guia: numeroRetorno,
        empresa_id: guia.empresa_id,
        estado_actual: 'registrado',
        nombre_remitente: empresa?.nombre || guia.nombre_destinatario || 'Remitente',
        nombre_destinatario: guia.nombre_remitente || 'Destino retorno',
        telefono_destinatario: guia.telefono_destinatario || null,
        direccion_destinatario: empresa?.direccion || guia.direccion_destinatario,
        ciudad_destino: empresa?.ciudad || guia.ciudad_destino || 'Santa Marta',
        barrio: guia.barrio,
        descripcion_paquete: guia.descripcion_paquete,
        peso_kg: guia.peso_kg,
        valor_declarado: guia.valor_declarado,
        observaciones: `RETORNO de guia ${guia.numero_guia}. ${guia.observaciones || ''}`.trim(),
      };

      const { data: guiaRetorno, error: retornoError } = await supabase
        .from('guias')
        .insert(payloadRetorno)
        .select('id')
        .single();

      if (retornoError) return res.status(500).json({ error: retornoError.message });

      guiaRetornoId = guiaRetorno.id;

      await supabase.from('historial_estados').insert({
        guia_id: guiaRetorno.id,
        estado: 'registrado',
        usuario_id: req.user.id,
        nota: `Guia de retorno creada desde devolucion de ${guia.numero_guia}`,
      });
    }

    const { data: devolucion, error: devError } = await supabase
      .from('devoluciones')
      .insert({
        guia_id: guiaId,
        guia_retorno_id: guiaRetornoId,
        motivo,
        descripcion: descripcion || null,
        estado: 'en_bodega',
        repartidor_id: guia.repartidor_id || null,
        admin_id: req.user.id,
        foto_paquete_url: fotoPaqueteUrl || null,
      })
      .select('id, guia_retorno_id')
      .single();

    if (devError) return res.status(500).json({ error: devError.message });

    return res.status(201).json({ devolucion_id: devolucion.id, guia_retorno_id: devolucion.guia_retorno_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/', verificarToken, checkRole(['admin', 'empresa']), checkAdminPermission('devoluciones.view'), async (req, res) => {
  try {
    const { estado, motivo, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, empresa_id: empresaId } = req.query;

    // Sincroniza automáticamente devoluciones faltantes para guías ya marcadas como devueltas.
    if (req.user.rol === 'admin') {
      let guiasDevueltasQuery = supabase
        .from('guias')
        .select('id, numero_guia, empresa_id, repartidor_id')
        .eq('estado_actual', 'devuelto');

      if (empresaId) guiasDevueltasQuery = guiasDevueltasQuery.eq('empresa_id', empresaId);

      const { data: guiasDevueltas, error: guiasDevueltasError } = await guiasDevueltasQuery;
      if (guiasDevueltasError) return res.status(500).json({ error: guiasDevueltasError.message });

      const idsDevueltos = (guiasDevueltas || []).map((g) => g.id);
      if (idsDevueltos.length > 0) {
        const { data: existentes, error: existentesError } = await supabase
          .from('devoluciones')
          .select('guia_id')
          .in('guia_id', idsDevueltos);

        if (existentesError) return res.status(500).json({ error: existentesError.message });

        const existentesSet = new Set((existentes || []).map((d) => d.guia_id));
        const faltantes = (guiasDevueltas || []).filter((g) => !existentesSet.has(g.id));

        if (faltantes.length > 0) {
          const rows = faltantes.map((g) => ({
            guia_id: g.id,
            guia_retorno_id: null,
            motivo: 'otro',
            descripcion: `Creado automaticamente para guia devuelta ${g.numero_guia}`,
            estado: 'en_bodega',
            repartidor_id: g.repartidor_id || null,
            admin_id: req.user.id,
            foto_paquete_url: null,
          }));

          const { error: insertSyncError } = await supabase
            .from('devoluciones')
            .insert(rows);

          if (insertSyncError) return res.status(500).json({ error: insertSyncError.message });
        }
      }
    }

    let query = supabase
      .from('devoluciones')
      .select('id, guia_id, guia_retorno_id, motivo, descripcion, estado, repartidor_id, admin_id, foto_paquete_url, created_at')
      .order('created_at', { ascending: false });

    if (estado) query = query.eq('estado', estado);
    if (motivo) query = query.eq('motivo', motivo);
    if (fechaDesde) query = query.gte('created_at', dayStart(fechaDesde));
    if (fechaHasta) query = query.lte('created_at', dayEnd(fechaHasta));

    const { data: devoluciones, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    if (!devoluciones || devoluciones.length === 0) return res.json([]);

    const guiaIds = [...new Set(devoluciones.map((d) => d.guia_id).filter(Boolean))];
    let guiasQuery = supabase
      .from('guias')
      .select('id, numero_guia, empresa_id, nombre_destinatario, repartidor_id')
      .in('id', guiaIds);

    if (req.user.rol === 'empresa') {
      guiasQuery = guiasQuery.eq('empresa_id', req.user.empresa_id);
    } else if (empresaId) {
      guiasQuery = guiasQuery.eq('empresa_id', empresaId);
    }

    const { data: guias, error: guiasError } = await guiasQuery;
    if (guiasError) return res.status(500).json({ error: guiasError.message });

    const guiaMap = (guias || []).reduce((acc, g) => {
      acc[g.id] = g;
      return acc;
    }, {});

    const empresaIds = [...new Set((guias || []).map((g) => g.empresa_id).filter(Boolean))];
    const repIds = [...new Set((devoluciones || []).map((d) => d.repartidor_id).filter(Boolean))];

    let empresaMap = {};
    if (empresaIds.length > 0) {
      const { data: empresas } = await supabase.from('empresas').select('id, nombre').in('id', empresaIds);
      empresaMap = (empresas || []).reduce((acc, e) => {
        acc[e.id] = e.nombre;
        return acc;
      }, {});
    }

    let repMap = {};
    if (repIds.length > 0) {
      const { data: reps } = await supabase.from('usuarios').select('id, nombre_completo').in('id', repIds);
      repMap = (reps || []).reduce((acc, r) => {
        acc[r.id] = r.nombre_completo;
        return acc;
      }, {});
    }

    const result = devoluciones
      .filter((d) => Boolean(guiaMap[d.guia_id]))
      .map((d) => ({
        ...d,
        guia: {
          id: guiaMap[d.guia_id].id,
          numero_guia: guiaMap[d.guia_id].numero_guia,
          nombre_destinatario: guiaMap[d.guia_id].nombre_destinatario,
          empresa_id: guiaMap[d.guia_id].empresa_id,
          empresa_nombre: empresaMap[guiaMap[d.guia_id].empresa_id] || 'Sin empresa',
        },
        repartidor_nombre: repMap[d.repartidor_id] || null,
      }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/estado', verificarToken, checkRole(['admin']), checkAdminPermission('devoluciones.manage'), async (req, res) => {
  try {
    const id = req.params.id;
    const estado = req.body?.estado;
    const observaciones = req.body?.observaciones;

    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: 'estado no valido' });
    }

    const { data: devolucion, error: findError } = await supabase
      .from('devoluciones')
      .select('id, estado, descripcion')
      .eq('id', id)
      .single();

    if (findError || !devolucion) return res.status(404).json({ error: 'Devolucion no encontrada' });

    const flow = ['en_bodega', 'en_retorno', 'devuelto_remitente'];
    const from = flow.indexOf(devolucion.estado);
    const to = flow.indexOf(estado);

    if (estado !== 'descartado' && (from === -1 || to === -1 || to < from)) {
      return res.status(409).json({ error: 'Solo se permite avanzar el estado de la devolucion' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('devoluciones')
      .update({
        estado,
        descripcion: observaciones ? `${devolucion.descripcion || ''}\n${observaciones}`.trim() : devolucion.descripcion,
        admin_id: req.user.id,
      })
      .eq('id', id)
      .select('id, estado, descripcion')
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/estadisticas', verificarToken, checkRole(['admin']), checkAdminPermission('devoluciones.view'), async (_req, res) => {
  try {
    const { data: devoluciones, error } = await supabase
      .from('devoluciones')
      .select('motivo');

    if (error) return res.status(500).json({ error: error.message });

    const total = (devoluciones || []).length;
    const porMotivoMap = (devoluciones || []).reduce((acc, row) => {
      acc[row.motivo] = (acc[row.motivo] || 0) + 1;
      return acc;
    }, {});

    const por_motivo = Object.keys(porMotivoMap).map((motivo) => {
      const cantidad = porMotivoMap[motivo];
      const porcentaje = total > 0 ? Number(((cantidad / total) * 100).toFixed(1)) : 0;
      return { motivo, cantidad, porcentaje };
    }).sort((a, b) => b.cantidad - a.cantidad);

    const { count: totalGuias } = await supabase
      .from('guias')
      .select('id', { count: 'exact', head: true });

    const tasa = totalGuias > 0 ? ((total / totalGuias) * 100).toFixed(1) : '0.0';

    return res.json({
      total,
      por_motivo,
      tasa_devolucion: `${tasa}%`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
