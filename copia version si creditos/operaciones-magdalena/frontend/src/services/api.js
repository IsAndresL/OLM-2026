const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

async function req(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const cfg = { method, headers };
  if (body) cfg.body = JSON.stringify(body);
  const res  = await fetch(`${BASE}${path}`, cfg);
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
  asignar:    (token, id, repId)   => req('PATCH', `/guias/${id}/asignar`, { repartidor_id: repId }, token),
  eliminar:   (token, id)          => req('DELETE', `/guias/${id}`, null, token),
  bulkUpload: (token, file) => {
    const fd = new FormData();
    fd.append('archivo', file);
    return fetch(`${BASE}/guias/bulk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    }).then(r => r.json().then(d => r.ok ? d : Promise.reject(new Error(d.error || 'Error al subir'))));
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
