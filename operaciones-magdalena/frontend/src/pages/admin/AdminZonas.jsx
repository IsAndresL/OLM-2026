import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import { zonasService, usuariosService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

function parseBarrios(text) {
  return text
    .split(/\n|,/)
    .map((b) => b.trim())
    .filter(Boolean);
}

export default function AdminZonas() {
  const { token } = useAuth();
  const [zonas, setZonas] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    color: '#1D4ED8',
    barriosText: '',
    repartidores: [],
  });

  async function cargarTodo() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [zonasData, repsData] = await Promise.all([
        zonasService.listar(token),
        usuariosService.listar(token, { rol: 'repartidor', activo: true, limit: 200 }),
      ]);

      setZonas(zonasData || []);
      setRepartidores(Array.isArray(repsData) ? repsData : (repsData?.data || []));
    } catch (err) {
      setErrorMsg(err.message || 'No se pudieron cargar las zonas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, [token]);

  function abrirNueva() {
    setEditing(null);
    setForm({ nombre: '', descripcion: '', color: '#1D4ED8', barriosText: '', repartidores: [] });
    setModalOpen(true);
  }

  function abrirEditar(zona) {
    setEditing(zona);
    setForm({
      nombre: zona.nombre || '',
      descripcion: zona.descripcion || '',
      color: zona.color || '#1D4ED8',
      barriosText: (zona.barrios || []).join('\n'),
      repartidores: (zona.repartidores || []).map((r) => r.id),
    });
    setModalOpen(true);
  }

  function toggleRepartidor(id) {
    setForm((prev) => ({
      ...prev,
      repartidores: prev.repartidores.includes(id)
        ? prev.repartidores.filter((x) => x !== id)
        : [...prev.repartidores, id],
    }));
  }

  async function guardarZona() {
    if (!form.nombre.trim()) return;
    setErrorMsg('');
    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        color: form.color,
        barrios: parseBarrios(form.barriosText),
        repartidores: form.repartidores,
      };

      if (editing) await zonasService.actualizar(token, editing.id, payload);
      else await zonasService.crear(token, payload);

      setModalOpen(false);
      await cargarTodo();
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo guardar la zona');
    }
  }

  async function desactivarZona(id) {
    if (!confirm('¿Desactivar esta zona?')) return;
    try {
      await zonasService.desactivar(token, id);
      await cargarTodo();
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo desactivar la zona');
    }
  }

  const resumen = useMemo(() => ({ total: zonas.length, activas: zonas.filter((z) => z.activa).length }), [zonas]);

  return (
    <Layout rol="admin">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-title text-gray-900">Zonas de reparto</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona barrios y repartidores asignados por zona.</p>
        </div>
        <button onClick={abrirNueva} className="px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold">+ Nueva zona</button>
      </div>

      {errorMsg && <div className="mb-4 p-3 rounded-xl border border-red-100 bg-red-50 text-red-600 text-sm">{errorMsg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">Total zonas</p>
          <p className="text-3xl font-title text-gray-900 mt-2">{resumen.total}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">Zonas activas</p>
          <p className="text-3xl font-title text-gray-900 mt-2">{resumen.activas}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-100">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">Cargando...</div>
        ) : zonas.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No hay zonas registradas.</div>
        ) : zonas.map((zona) => (
          <div key={zona.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: zona.color }} />
                <p className="font-semibold text-gray-900">{zona.nombre}</p>
                {!zona.activa && <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">Inactiva</span>}
              </div>
              <p className="text-sm text-gray-600 mt-1">{zona.descripcion || 'Sin descripción'}</p>
              <p className="text-xs text-gray-500 mt-1">
                {(zona.repartidores || []).length} repartidores · {(zona.barrios || []).length} barrios
              </p>
              <p className="text-xs text-gray-400 mt-1 truncate max-w-2xl">{(zona.barrios || []).join(', ') || 'Sin barrios'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => abrirEditar(zona)} className="px-3 py-1.5 text-xs rounded-lg bg-amber-50 text-amber-700 font-bold">Editar</button>
              <button onClick={() => desactivarZona(zona.id)} className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 font-bold">Desactivar</button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-title text-xl text-gray-900">{editing ? 'Editar zona' : 'Nueva zona'}</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nombre</label>
                  <input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Color</label>
                  <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} className="w-full h-10 p-1 border border-gray-300 rounded-xl" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Descripción</label>
                <textarea rows="2" value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Barrios (uno por línea o separados por coma)</label>
                <textarea rows="5" value={form.barriosText} onChange={(e) => setForm((p) => ({ ...p, barriosText: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Repartidores asignados</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-44 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-gray-50">
                  {repartidores.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={form.repartidores.includes(r.id)} onChange={() => toggleRepartidor(r.id)} className="rounded border-gray-300" />
                      {r.nombre_completo}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={guardarZona} className="px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
