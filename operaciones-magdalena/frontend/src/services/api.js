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
  toggleEstado: (token, id, activo)  => req('PATCH', `/usuarios/${id}/estado`, { activo }, token),
};

export const guiasService = {
  listar:  (token, params = {}) => { const qs = new URLSearchParams(params).toString(); return req('GET', `/guias${qs ? '?'+qs : ''}`, null, token); },
  obtener: (token, id)          => req('GET',   `/guias/${id}`, null, token),
  crear:   (token, data)        => req('POST',  '/guias', data, token),
  editar:  (token, id, data)    => req('PUT',   `/guias/${id}`, data, token),
  asignar: (token, id, repId)   => req('PATCH', `/guias/${id}/asignar`, { repartidor_id: repId }, token),
};

export const repartidorService = {
  misGuias: (token, params = {}) => { const qs = new URLSearchParams(params).toString(); return req('GET', `/repartidor/mis-guias${qs ? '?'+qs : ''}`, null, token); },
};

export const trackingService = {
  consultar: (numeroGuia) => req('GET', `/tracking/${numeroGuia}`),
};

export const dashboardService = {
  resumen:   (token, fecha)   => req('GET', `/dashboard/resumen${fecha ? '?fecha='+fecha : ''}`, null, token),
  tendencia: (token, dias=30) => req('GET', `/dashboard/tendencia?dias=${dias}`, null, token),
};
