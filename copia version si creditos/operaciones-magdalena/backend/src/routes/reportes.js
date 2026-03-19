const express = require('express');
const XLSX = require('xlsx-js-style');
const supabase = require('../config/supabase');
const { verificarToken, checkRole } = require('../middlewares/auth');

const router = express.Router();

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
      
      const vDec = g.valor_declarado ? parseFloat(g.valor_declarado).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }) : '';

      return [
        g.numero_guia, g.created_at?.substring(0, 10),
        g.nombre_remitente, g.nombre_destinatario,
        g.telefono_destinatario, g.direccion_destinatario,
        g.ciudad_destino, g.barrio || '',
        g.peso_kg || '', vDec,
        g.estado_actual,
        g.empresa?.nombre || '', g.repartidor?.nombre_completo || '',
        g.ultimo_cambio?.substring(0, 16)?.replace('T',' ') || '',
        g.observaciones || ''
      ].map(v => ({ v: v ?? '', s: cellStyle }));
    })
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ancho de columnas automático
  ws['!cols'] = [12, 14, 20, 20, 15, 25, 15, 15, 10, 15, 15, 20, 20, 20, 30].map(w => ({ wch: w }));

  // Congelar primera fila
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, 'Guías');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// GET /api/v1/reportes/exportar
router.get('/exportar', verificarToken, checkRole(['admin', 'empresa']), async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, repartidor_id, estado } = req.query;
    
    // Determinar empresa_id según rol o query param
    let empresa_id = req.user.rol === 'empresa' ? req.user.empresa_id : req.query.empresa_id;

    // Query a Supabase
    let query = supabase
      .from('guias')
      .select(`
        *,
        empresa:empresas(id, nombre),
        repartidor:usuarios!repartidor_id(id, nombre_completo),
        historial_estados!left(created_at, estado, nota)
      `)
      .order('created_at', { ascending: false })
      .limit(5000); // Límite generoso sin paginación

    if (empresa_id) query = query.eq('empresa_id', empresa_id);
    if (repartidor_id) query = query.eq('repartidor_id', repartidor_id);
    if (estado) query = query.eq('estado_actual', estado);
    if (fecha_desde) query = query.gte('created_at', fecha_desde + 'T00:00:00');
    if (fecha_hasta) query = query.lte('created_at', fecha_hasta + 'T23:59:59');

    const { data: guias, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Preparar el array para el excel
    const guiasPreparadas = guias.map(g => {
        // Find latest hist date
        let ult = null;
        if (g.historial_estados && g.historial_estados.length > 0) {
            const arr = g.historial_estados.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            ult = arr[0]?.created_at;
        }

        return {
            ...g,
            ultimo_cambio: ult || g.updated_at
        };
    });

    const buffer = generarExcel(guiasPreparadas);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-magdalena-${new Date().toISOString().substring(0,10)}.xlsx"`
    });
    
    return res.end(buffer);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
