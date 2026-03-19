import { useEffect, useMemo, useState } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Layout from '../../components/Layout';
import MapaBase from '../../components/MapaBase';
import { rutasService, usuariosService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

function SortableItem({ guia }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: guia.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="bg-white border border-gray-200 rounded-xl p-3 cursor-grab active:cursor-grabbing">
      <p className="text-xs uppercase font-bold text-gray-500">{guia.numero_guia}</p>
      <p className="text-sm font-semibold text-gray-800">{guia.nombre_destinatario}</p>
      <p className="text-xs text-gray-500">{guia.direccion_destinatario}</p>
    </div>
  );
}

export default function AdminRutas() {
  const { token } = useAuth();
  const [repartidores, setRepartidores] = useState([]);
  const [repartidorId, setRepartidorId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ruta, setRuta] = useState(null);
  const [orden, setOrden] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    async function init() {
      try {
        const reps = await usuariosService.listar(token, { rol: 'repartidor', activo: true, limit: 200 });
        const rows = Array.isArray(reps) ? reps : (reps?.data || []);
        setRepartidores(rows);
      } catch (err) {
        setErrorMsg(err.message || 'No se pudieron cargar repartidores');
      }
    }
    init();
  }, [token]);

  async function cargarRuta() {
    if (!repartidorId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await rutasService.obtener(token, repartidorId, fecha);
      setRuta(data);
      setOrden(data.orden || []);
    } catch (err) {
      setRuta(null);
      setOrden([]);
      setErrorMsg(err.message || 'No hay ruta guardada para ese repartidor y fecha');
    } finally {
      setLoading(false);
    }
  }

  async function optimizar() {
    if (!repartidorId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await rutasService.optimizar(token, {
        repartidor_id: repartidorId,
        fecha,
        origen: { lat: 11.2408, lng: -74.1990 },
      });

      const ordenOptimizado = (data.orden || []).map((row) => ({
        id: row.guia_id,
        numero_guia: row.numero_guia,
        nombre_destinatario: row.nombre_destinatario,
        direccion_destinatario: row.direccion_destinatario,
        lat: row.lat,
        lng: row.lng,
      }));

      setRuta({
        id: data.ruta_id,
        distancia_km: data.distancia_total_km,
        tiempo_min: data.tiempo_total_min,
      });
      setOrden(ordenOptimizado);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo optimizar la ruta');
    } finally {
      setLoading(false);
    }
  }

  async function guardarOrden() {
    if (!ruta?.id || !orden.length) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await rutasService.reordenar(token, ruta.id, orden.map((g) => g.id));
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo guardar el nuevo orden');
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrden((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  const polyline = useMemo(() => {
    return orden
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => [Number(p.lat), Number(p.lng)]);
  }, [orden]);

  const center = polyline.length > 0 ? polyline[0] : [11.2408, -74.1990];

  return (
    <Layout rol="admin">
      <div className="mb-6">
        <h1 className="text-3xl font-title text-gray-900">Rutas del día</h1>
        <p className="text-sm text-gray-500 mt-1">Optimiza, reordena y guarda la secuencia de entregas por repartidor.</p>
      </div>

      {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{errorMsg}</div>}

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select value={repartidorId} onChange={(e) => setRepartidorId(e.target.value)} className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-xl text-sm">
          <option value="">Seleccionar repartidor</option>
          {repartidores.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre_completo}</option>
          ))}
        </select>

        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-xl text-sm" />

        <button onClick={optimizar} disabled={!repartidorId || loading} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-60">
          {loading ? 'Procesando...' : 'Optimizar ruta'}
        </button>

        <button onClick={cargarRuta} disabled={!repartidorId || loading} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-60">
          Cargar ruta
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-title text-xl text-gray-900">Orden de entrega</h3>
            <button onClick={guardarOrden} disabled={!ruta?.id || !orden.length || saving} className="px-3 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-60">
              {saving ? 'Guardando...' : 'Guardar orden'}
            </button>
          </div>

          {!orden.length ? (
            <p className="text-sm text-gray-500">Sin datos de ruta para mostrar.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orden.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-1">
                  {orden.map((guia, index) => (
                    <div key={guia.id} className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center mt-1">{index + 1}</div>
                      <div className="flex-1"><SortableItem guia={guia} /></div>
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="xl:col-span-3 bg-white border border-gray-100 rounded-2xl shadow-sm p-3">
          <MapaBase center={center} zoom={12} height="68vh" scrollWheelZoom>
            {polyline.length > 1 && <Polyline positions={polyline} color="#16A34A" weight={4} />}
            {orden.filter((g) => g.lat != null && g.lng != null).map((g) => (
              <Marker key={g.id} position={[Number(g.lat), Number(g.lng)]} />
            ))}
          </MapaBase>
          <div className="mt-3 text-sm text-gray-600 flex flex-wrap gap-4">
            <span>Paradas: <strong>{orden.length}</strong></span>
            <span>Distancia total: <strong>{ruta?.distancia_km ?? 'N/D'} km</strong></span>
            <span>Tiempo estimado: <strong>{ruta?.tiempo_min ?? 'N/D'} min</strong></span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
