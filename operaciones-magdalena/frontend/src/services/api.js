const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function req(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const cfg = { method, headers };
  if (body) cfg.body = JSON.stringify(body);
  const url = `${BASE}${path}`;
  const retryableNetworkError = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed');
  };

  let lastError = null;
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, cfg);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (!retryableNetworkError(err) || attempt === 2) break;
      await sleep(250 * (attempt + 1));
    }
  }

  if (lastError) {
    throw new Error('Sin conexion temporal. Intenta nuevamente.');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const authService = {
  login:  (email, password) => req('POST', '/auth/login', { email, password }),
  logout: (token)           => req('POST', '/auth/logout', null, token),
  me:     (token)           => req('GET',  '/auth/me', null, token),
};

export const usuariosService = {
  listar:       (token, params = {}) => { const qs = new URLSearchParams(params).toString(); return req('GET', `/usuarios${qs ? '?'+qs : ''}`, null, token); },
  crear:        (token, data)        => req('POST',  '/usuarios', data, token),
  editar:       (token, id, data)    => req('PUT',   `/usuarios/${id}`, data, token),
  eliminar:     (token, id)          => req('DELETE', `/usuarios/${id}`, null, token),
  toggleEstado: (token, id, activo)  => req('PATCH', `/usuarios/${id}/estado`, { activo }, token),
  subirAvatar:  (token, id, file) => {
    const fd = new FormData();
    fd.append('foto', file);
    return fetch(`${BASE}/usuarios/${id}/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(r => r.json().then(d => r.ok ? d : Promise.reject(new Error(d.error))));
  },
};

export const guiasService = {
  listar:     (token, params = {}) => { const qs = new URLSearchParams(params).toString(); return req('GET', `/guias${qs ? '?'+qs : ''}`, null, token); },
  obtener:    (token, id)          => req('GET',   `/guias/${id}`, null, token),
  crear:      (token, data)        => req('POST',  '/guias', data, token),
  editar:     (token, id, data)    => req('PUT',   `/guias/${id}`, data, token),
  actualizar: (token, id, data)    => req('PUT',   `/guias/${id}`, data, token),
  asignar:    (token, id, repId)   => req('PATCH', `/guias/${id}/asignar`, { repartidor_id: repId }, token),
  asignarBulk: (token, guiaIds, repId) => req('POST', '/guias/bulk-assign', { guia_ids: guiaIds, repartidor_id: repId }, token),
  deshacerAsignacionBulk: (token, cambios) => req('POST', '/guias/bulk-assign/undo', { cambios }, token),
  eliminar:   (token, id)          => req('DELETE', `/guias/${id}`, null, token),
  eliminarBulk: (token, guiaIds)   => req('POST', '/guias/bulk-delete', { guia_ids: guiaIds }, token),
  bulkUpload: (token, file, options = {}) => {
    const fd = new FormData();
    fd.append('archivo', file);
    if (options.empresa_id) fd.append('empresa_id', options.empresa_id);
    return fetch(`${BASE}/guias/bulk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(async (r) => {
      const raw = await r.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (_e) {
        data = null;
      }

      if (!r.ok) {
        const message = data?.error || raw || `Error ${r.status} al subir archivo`;
        return Promise.reject(new Error(message));
      }

      return data;
    });
  },
};

export const etiquetasService = {
  descargar: (token, guiaId) => {
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

export const empresasService = {
  listar: (token) => req('GET', '/empresas', null, token),
};

// Helper para descargar blobs 
export function descargarArchivo(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

export const trackingService = {
  consultar: (numeroGuia) => req('GET', `/tracking/${numeroGuia.trim().toUpperCase()}`),
};

export const dashboardService = {
  resumen:   (token, params = {}) => {
    const qs = new URLSearchParams();
    if (params.fecha) qs.append('fecha', params.fecha);
    if (params.empresaId) qs.append('empresa_id', params.empresaId);
    if (params.repartidorId) qs.append('repartidor_id', params.repartidorId);
    return req('GET', `/dashboard/resumen${qs.toString() ? `?${qs.toString()}` : ''}`, null, token);
  },
  tendencia: (token, params = {}) => {
    const qs = new URLSearchParams();
    if (params.dias) qs.append('dias', String(params.dias));
    if (params.empresaId) qs.append('empresa_id', params.empresaId);
    if (params.repartidorId) qs.append('repartidor_id', params.repartidorId);
    if (params.fechaDesde) qs.append('fecha_desde', params.fechaDesde);
    if (params.fechaHasta) qs.append('fecha_hasta', params.fechaHasta);
    return req('GET', `/dashboard/tendencia${qs.toString() ? `?${qs.toString()}` : ''}`, null, token);
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
  exportarDetallado: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetch(`${BASE}/reportes/exportar-detallado${qs ? '?'+qs : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (!r.ok) throw new Error('Error al generar reporte detallado');
      return r.blob();
    });
  },
  exportarGuiaPdfDetallado: (token, guiaId) => {
    return fetch(`${BASE}/reportes/guia/${guiaId}/pdf-detallado`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (!r.ok) throw new Error('Error al generar PDF detallado de la guia');
      return r.blob();
    });
  },
};

export const codService = {
  activarCOD: (token, guiaId, data) => req('POST', `/cod/guia/${guiaId}/activar`, data, token),
  registrarCobro: (token, guiaId, data) => req('POST', `/cod/guia/${guiaId}/registrar-cobro`, data, token),
  pendientesRepartidor: (token) => req('GET', '/cod/repartidor/pendientes', null, token),
  resumenAdmin: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/cod/resumen-admin${qs ? '?'+qs : ''}`, null, token);
  },
  registrarCorte: (token, data) => req('POST', '/cod/corte-caja', data, token),
  listarCortes: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/cod/cortes${qs ? '?'+qs : ''}`, null, token);
  },
  detalleCorte: (token, corteId) => req('GET', `/cod/cortes/${corteId}`, null, token),
  verificarCorte: (token, corteId, data) => req('PATCH', `/cod/cortes/${corteId}/verificar`, data, token),
};

export const liquidacionesService = {
  calcular: (token, params) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/liquidaciones/calcular?${qs}`, null, token);
  },
  crear: (token, data) => req('POST', '/liquidaciones', data, token),
  listar: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/liquidaciones${qs ? '?'+qs : ''}`, null, token);
  },
  detalle: (token, id) => req('GET', `/liquidaciones/${id}`, null, token),
  cambiarEstado: (token, id, data) => req('PATCH', `/liquidaciones/${id}/estado`, data, token),
  descargarPDF: (token, id) => {
    return fetch(`${BASE}/liquidaciones/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Error al generar PDF'))));
  },
};

export const tarifasService = {
  listarRepartidores: (token) => req('GET', '/tarifas/repartidores', null, token),
  guardarRepartidor: (token, repartidorId, data) => req('POST', `/tarifas/repartidores/${repartidorId}`, data, token),
  listarEmpresas: (token) => req('GET', '/tarifas/empresas', null, token),
  guardarEmpresa: (token, empresaId, data) => req('POST', `/tarifas/empresas/${empresaId}`, data, token),
};

export const gpsService = {
  actualizarUbicacion: (token, data) => req('PUT', '/gps/ubicacion', data, token),
  desactivarUbicacion: (token) => req('DELETE', '/gps/ubicacion', null, token),
  listarRepartidores: (token) => req('GET', '/gps/repartidores', null, token),
  ubicacionPublica: (trackingToken) => req('GET', `/gps/public/${encodeURIComponent(trackingToken)}/ubicacion`),
  historial: (token, repartidorId, fecha) => req('GET', `/gps/repartidor/${repartidorId}/historial${fecha ? `?fecha=${fecha}` : ''}`, null, token),
};

export const zonasService = {
  listar: (token) => req('GET', '/zonas', null, token),
  crear: (token, data) => req('POST', '/zonas', data, token),
  actualizar: (token, id, data) => req('PUT', `/zonas/${id}`, data, token),
  desactivar: (token, id) => req('DELETE', `/zonas/${id}`, null, token),
  detectar: (token, barrio) => req('GET', `/zonas/detectar?barrio=${encodeURIComponent(barrio)}`, null, token),
};

export const devolucionesService = {
  crear: (token, data) => req('POST', '/devoluciones', data, token),
  listar: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/devoluciones${qs ? `?${qs}` : ''}`, null, token);
  },
  cambiarEstado: (token, id, data) => req('PATCH', `/devoluciones/${id}/estado`, data, token),
  estadisticas: (token) => req('GET', '/devoluciones/estadisticas', null, token),
};

export const firmaService = {
  subir: (token, guiaId, blob) => {
    const fd = new FormData();
    fd.append('firma', blob, 'firma.png');
    return fetch(`${BASE}/repartidor/firma/${guiaId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error || 'Error subiendo firma')))));
  },
};
