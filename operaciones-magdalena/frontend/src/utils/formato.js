export function formatCOP(monto) {
  if (monto === null || monto === undefined || monto === '') return '—';
  return '$' + Number(monto).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatPeriodo(desde, hasta) {
  if (!desde || !hasta) return '—';
  const d = new Date(desde);
  const h = new Date(hasta);
  const mes = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  return `${d.getDate()} al ${h.getDate()} de ${mes}`;
}
