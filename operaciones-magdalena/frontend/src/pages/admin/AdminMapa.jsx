import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import Layout from '../../components/Layout';
import MapaBase from '../../components/MapaBase';
import { gpsService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

function minsFromNow(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const ms = Date.now() - new Date(dateValue).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

function estadoActividad(updatedAt) {
  const mins = minsFromNow(updatedAt);
  if (mins < 5) return { key: 'activo', color: 'text-emerald-600', dot: 'bg-emerald-500' };
  if (mins <= 20) return { key: 'sin_movimiento', color: 'text-amber-600', dot: 'bg-amber-500' };
  return { key: 'sin_conexion', color: 'text-red-600', dot: 'bg-red-500' };
}

const MARKER_PALETTE = [
  { primary: '#2563EB', soft: 'rgba(37,99,235,0.22)' },
  { primary: '#0EA5E9', soft: 'rgba(14,165,233,0.22)' },
  { primary: '#14B8A6', soft: 'rgba(20,184,166,0.22)' },
  { primary: '#22C55E', soft: 'rgba(34,197,94,0.22)' },
  { primary: '#EAB308', soft: 'rgba(234,179,8,0.25)' },
  { primary: '#F97316', soft: 'rgba(249,115,22,0.22)' },
  { primary: '#EF4444', soft: 'rgba(239,68,68,0.22)' },
  { primary: '#A855F7', soft: 'rgba(168,85,247,0.22)' },
];

export default function AdminMapa() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [focusedRepId, setFocusedRepId] = useState(null);
  const [manualCenter, setManualCenter] = useState(null);
  const [countdown, setCountdown] = useState(30);

  async function cargar() {
    if (!token) return;
    setErrorMsg('');
    try {
      const data = await gpsService.listarRepartidores(token);
      setItems(data || []);
      if ((!manualCenter || !Array.isArray(manualCenter)) && Array.isArray(data) && data.length > 0) {
        setManualCenter([Number(data[0].lat), Number(data[0].lng)]);
      }
      setLastRefresh(new Date());
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar el mapa en vivo');
    } finally {
      setLoading(false);
      setCountdown(30);
    }
  }

  function ubicarRepartidor(item) {
    setFocusedRepId(item.repartidor_id);
    setManualCenter([Number(item.lat), Number(item.lng)]);
  }

  function getInitials(name = '') {
    const cleaned = String(name).trim();
    if (!cleaned) return 'R';
    const parts = cleaned.split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join('');
  }

  function markerIcon(item, color) {
    const avatar = item?.avatar_url ? encodeURI(item.avatar_url) : '';
    const initials = getInitials(item?.nombre_completo);
    const isFocused = focusedRepId === item?.repartidor_id;
    const glow = isFocused
      ? `0 0 0 8px ${color.soft}, 0 14px 24px rgba(0,0,0,0.28)`
      : `0 0 0 6px ${color.soft}, 0 10px 18px rgba(0,0,0,0.24)`;

    const html = `
      <div style="position:relative;width:46px;height:58px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:14px;height:14px;background:${color.primary};clip-path:polygon(50% 100%, 0 0, 100% 0);"></div>
        <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:42px;height:42px;border-radius:9999px;border:3px solid ${color.primary};overflow:hidden;background:#ffffff;box-shadow:${glow};display:flex;align-items:center;justify-content:center;font:700 12px/1 sans-serif;color:${color.primary};">
          ${avatar ? `<img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;"/>` : initials}
        </div>
      </div>
    `;

    return L.divIcon({
      className: 'olm-repartidor-marker',
      html,
      iconSize: [46, 58],
      iconAnchor: [23, 56],
      popupAnchor: [0, -48],
    });
  }

  useEffect(() => {
    cargar();
  }, [token]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          cargar();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [token]);

  const center = useMemo(() => {
    if (Array.isArray(manualCenter) && manualCenter.length === 2) return manualCenter;
    if (!items.length) return [11.2408, -74.1990];
    return [Number(items[0].lat), Number(items[0].lng)];
  }, [items, manualCenter]);

  const repColorMap = useMemo(() => {
    const map = {};
    items.forEach((item, idx) => {
      map[item.repartidor_id] = MARKER_PALETTE[idx % MARKER_PALETTE.length];
    });
    return map;
  }, [items]);

  return (
    <Layout rol="admin">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-title text-gray-900">Mapa en tiempo real</h1>
          <p className="text-sm text-gray-500 mt-1">Ubicación en vivo de repartidores activos.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs rounded-xl bg-gray-100 px-3 py-2 text-gray-600 font-semibold">Actualiza en: {countdown}s</div>
          <button onClick={cargar} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Actualizar</button>
        </div>
      </div>

      {errorMsg && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 border border-red-100 text-sm">{errorMsg}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-1 bg-white border border-gray-100 rounded-2xl shadow-sm p-4 max-h-[70vh] overflow-y-auto">
          <h3 className="font-title text-lg text-gray-900 mb-3">Repartidores activos</h3>
          {loading ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500">No hay repartidores compartiendo ubicación.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const actividad = estadoActividad(item.updated_at);
                const color = repColorMap[item.repartidor_id] || MARKER_PALETTE[0];
                return (
                  <div key={item.repartidor_id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-gray-800 inline-flex items-center gap-2">
                        <span className="inline-flex w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.primary }} />
                        {item.nombre_completo}
                      </p>
                      <span className={`inline-flex w-2.5 h-2.5 rounded-full ${actividad.dot}`} />
                    </div>
                    <p className={`text-xs mt-1 ${actividad.color}`}>Último ping: {item.ultimo_estado_hace}</p>
                    <p className="text-xs text-gray-500">Guías activas: {item.guias_activas}</p>
                    <button
                      onClick={() => ubicarRepartidor(item)}
                      className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-bold ${focusedRepId === item.repartidor_id ? 'bg-brand-primary text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                      Ubicar en mapa
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {lastRefresh && <p className="text-[11px] text-gray-400 mt-3">Última actualización: {lastRefresh.toLocaleTimeString('es-CO')}</p>}
        </div>

        <div className="xl:col-span-3 bg-white border border-gray-100 rounded-2xl shadow-sm p-3">
          <MapaBase center={center} zoom={12} height="68vh" scrollWheelZoom>
            {items.map((item) => (
              <Marker
                key={item.repartidor_id}
                position={[Number(item.lat), Number(item.lng)]}
                icon={markerIcon(item, repColorMap[item.repartidor_id] || MARKER_PALETTE[0])}
              >
                <Popup>
                  <div className="text-xs">
                    <p><strong>{item.nombre_completo}</strong></p>
                    <p>Guías activas: {item.guias_activas}</p>
                    <p>Último ping: {item.ultimo_estado_hace}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapaBase>

          <div className="mt-3 text-xs text-gray-600 flex flex-wrap gap-4">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Activo (&lt;5 min)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Sin movimiento (5-20 min)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Sin conexión (&gt;20 min)</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
