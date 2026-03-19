import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup, Polyline } from 'react-leaflet';
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

export default function AdminMapa() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedRep, setSelectedRep] = useState(null);
  const [traza, setTraza] = useState([]);
  const [countdown, setCountdown] = useState(30);

  async function cargar() {
    if (!token) return;
    setErrorMsg('');
    try {
      const data = await gpsService.listarRepartidores(token);
      setItems(data || []);
      setLastRefresh(new Date());
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar el mapa en vivo');
    } finally {
      setLoading(false);
      setCountdown(30);
    }
  }

  async function verRuta(repartidorId) {
    try {
      setSelectedRep(repartidorId);
      const fecha = new Date().toISOString().slice(0, 10);
      const data = await gpsService.historial(token, repartidorId, fecha);
      setTraza(data || []);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar el historial de ruta');
    }
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
    if (!items.length) return [11.2408, -74.1990];
    return [Number(items[0].lat), Number(items[0].lng)];
  }, [items]);

  const polilinea = useMemo(() => (traza || []).map((p) => [Number(p.lat), Number(p.lng)]), [traza]);

  return (
    <Layout rol="admin">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-title text-gray-900">Mapa en tiempo real</h1>
          <p className="text-sm text-gray-500 mt-1">Ubicación de repartidores activos y trazado de ruta del día.</p>
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
                return (
                  <div key={item.repartidor_id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-gray-800">{item.nombre_completo}</p>
                      <span className={`inline-flex w-2.5 h-2.5 rounded-full ${actividad.dot}`} />
                    </div>
                    <p className={`text-xs mt-1 ${actividad.color}`}>Último ping: {item.ultimo_estado_hace}</p>
                    <p className="text-xs text-gray-500">Guías activas: {item.guias_activas}</p>
                    <button
                      onClick={() => verRuta(item.repartidor_id)}
                      className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-bold ${selectedRep === item.repartidor_id ? 'bg-brand-primary text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                      Ver ruta
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
              <Marker key={item.repartidor_id} position={[Number(item.lat), Number(item.lng)]}>
                <Popup>
                  <div className="text-xs">
                    <p><strong>{item.nombre_completo}</strong></p>
                    <p>Guías activas: {item.guias_activas}</p>
                    <p>Último ping: {item.ultimo_estado_hace}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
            {polilinea.length > 1 && <Polyline positions={polilinea} color="#2563EB" weight={4} />}
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
