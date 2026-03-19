import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import { devolucionesService, empresasService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatFecha } from '../../utils/formato';

const ESTADOS = ['en_bodega', 'en_retorno', 'devuelto_remitente', 'descartado'];
const MOTIVOS = ['no_contesto', 'direccion_incorrecta', 'rechazo_cliente', 'paquete_danado', 'direccion_no_existe', 'otro'];

export default function AdminDevoluciones() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, por_motivo: [], tasa_devolucion: '0%' });
  const [empresas, setEmpresas] = useState([]);
  const [filtros, setFiltros] = useState({ estado: '', motivo: '', empresa_id: '', fecha_desde: '', fecha_hasta: '' });
  const [detalle, setDetalle] = useState(null);

  async function cargarTodo(currentFilters = filtros) {
    setLoading(true);
    setErrorMsg('');
    try {
      const [lista, estadisticas, emp] = await Promise.all([
        devolucionesService.listar(token, currentFilters),
        devolucionesService.estadisticas(token),
        empresasService.listar(token),
      ]);
      setItems(lista || []);
      setStats(estadisticas || { total: 0, por_motivo: [], tasa_devolucion: '0%' });
      setEmpresas(emp || []);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar devoluciones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, [token]);

  async function aplicarFiltros() {
    await cargarTodo(filtros);
  }

  async function avanzarEstado(id, estado) {
    try {
      await devolucionesService.cambiarEstado(token, id, { estado });
      await cargarTodo(filtros);
      if (detalle?.id === id) {
        const updated = items.find((x) => x.id === id);
        if (updated) setDetalle({ ...updated, estado });
      }
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo actualizar estado');
    }
  }

  const resumen = useMemo(() => ({
    en_bodega: items.filter((x) => x.estado === 'en_bodega').length,
    en_retorno: items.filter((x) => x.estado === 'en_retorno').length,
    devuelto_remitente: items.filter((x) => x.estado === 'devuelto_remitente').length,
  }), [items]);

  return (
    <Layout rol="admin">
      <div className="mb-6">
        <h1 className="text-3xl font-title text-gray-900">Devoluciones</h1>
        <p className="text-sm text-gray-500 mt-1">Control de logística inversa y guía de retorno.</p>
      </div>

      {errorMsg && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{errorMsg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"><p className="text-xs text-gray-500 uppercase font-bold">En bodega</p><p className="text-2xl font-title mt-2">{resumen.en_bodega}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"><p className="text-xs text-gray-500 uppercase font-bold">En retorno</p><p className="text-2xl font-title mt-2">{resumen.en_retorno}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"><p className="text-xs text-gray-500 uppercase font-bold">Devuelto remitente</p><p className="text-2xl font-title mt-2">{resumen.devuelto_remitente}</p></div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm grid grid-cols-1 md:grid-cols-6 gap-3">
        <select value={filtros.motivo} onChange={(e) => setFiltros((p) => ({ ...p, motivo: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-xl text-sm">
          <option value="">Motivo</option>
          {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <select value={filtros.estado} onChange={(e) => setFiltros((p) => ({ ...p, estado: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-xl text-sm">
          <option value="">Estado</option>
          {ESTADOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <select value={filtros.empresa_id} onChange={(e) => setFiltros((p) => ({ ...p, empresa_id: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-xl text-sm">
          <option value="">Empresa</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>

        <input type="date" value={filtros.fecha_desde} onChange={(e) => setFiltros((p) => ({ ...p, fecha_desde: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-xl text-sm" />
        <input type="date" value={filtros.fecha_hasta} onChange={(e) => setFiltros((p) => ({ ...p, fecha_hasta: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-xl text-sm" />

        <button onClick={aplicarFiltros} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Filtrar</button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
              <tr>
                <th className="p-4 text-left">Guía</th>
                <th className="p-4 text-left">Destinatario</th>
                <th className="p-4 text-left">Motivo</th>
                <th className="p-4 text-left">Estado</th>
                <th className="p-4 text-left">Empresa</th>
                <th className="p-4 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="p-6 text-center text-gray-400">Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="6" className="p-6 text-center text-gray-400">Sin devoluciones para los filtros seleccionados.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} onClick={() => setDetalle(item)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="p-4 font-semibold text-gray-800">{item.guia?.numero_guia || '—'}</td>
                  <td className="p-4">{item.guia?.nombre_destinatario || '—'}</td>
                  <td className="p-4 capitalize">{item.motivo?.replaceAll('_', ' ')}</td>
                  <td className="p-4"><span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full capitalize">{item.estado?.replaceAll('_', ' ')}</span></td>
                  <td className="p-4">{item.guia?.empresa_nombre || '—'}</td>
                  <td className="p-4">{formatFecha(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detalle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-100 shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-title text-xl text-gray-900">Detalle devolución</h3>
              <button onClick={() => setDetalle(null)} className="text-gray-500">Cerrar</button>
            </div>
            <div className="p-5 space-y-2 text-sm text-gray-700">
              <p><strong>Guía:</strong> {detalle.guia?.numero_guia}</p>
              <p><strong>Destinatario:</strong> {detalle.guia?.nombre_destinatario}</p>
              <p><strong>Motivo:</strong> {detalle.motivo?.replaceAll('_', ' ')}</p>
              <p><strong>Estado:</strong> {detalle.estado?.replaceAll('_', ' ')}</p>
              <p><strong>Descripción:</strong> {detalle.descripcion || 'Sin descripción'}</p>
              <p><strong>Tasa devolución global:</strong> {stats.tasa_devolucion}</p>
              <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                {ESTADOS.filter((s) => s !== detalle.estado).map((s) => (
                  <button key={s} onClick={() => avanzarEstado(detalle.id, s)} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold capitalize">
                    Marcar {s.replaceAll('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
