import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, HandCoins } from 'lucide-react';
import Layout from '../../components/Layout';
import { codService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCOP, formatFecha } from '../../utils/formato';

const ESTADO_STYLES = {
  pendiente: 'bg-amber-100 text-amber-700',
  verificado: 'bg-emerald-100 text-emerald-700',
  discrepancia: 'bg-red-100 text-red-700',
};

function InfoCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">{label}</p>
      <p className="text-2xl font-title text-gray-900 mt-2">{value}</p>
    </div>
  );
}

export default function AdminCorteCaja() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [cortes, setCortes] = useState([]);
  const [filtros, setFiltros] = useState({ estado: '', repartidor_id: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [montoRecibido, setMontoRecibido] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  async function cargarCortes(params = filtros) {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await codService.listarCortes(token, params);
      setCortes(data || []);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar la caja de contraentrega');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarCortes();
  }, []);

  async function abrirVerificacion(corteId) {
    try {
      const data = await codService.detalleCorte(token, corteId);
      setDetalle(data);
      setMontoRecibido(String(data.monto_declarado || ''));
      setObservaciones(data.observaciones || '');
      setModalOpen(true);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar el detalle del corte');
    }
  }

  async function confirmarVerificacion() {
    if (!detalle) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await codService.verificarCorte(token, detalle.id, {
        monto_recibido: Number(montoRecibido),
        observaciones,
      });
      setModalOpen(false);
      await cargarCortes();
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo verificar el corte');
    } finally {
      setSaving(false);
    }
  }

  const resumen = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);

    const recaudadoHoy = cortes
      .filter((c) => String(c.created_at || '').startsWith(hoy))
      .reduce((acc, c) => acc + Number(c.monto_declarado || 0), 0);

    const entregadoSede = cortes
      .filter((c) => c.estado === 'verificado')
      .reduce((acc, c) => acc + Number(c.monto_recibido || 0), 0);

    const pendienteEntrega = cortes
      .filter((c) => c.estado === 'pendiente')
      .reduce((acc, c) => acc + Number(c.monto_declarado || 0), 0);

    const enCirculacion = Math.max(0, recaudadoHoy + pendienteEntrega - entregadoSede);

    return { enCirculacion, recaudadoHoy, entregadoSede, pendienteEntrega };
  }, [cortes]);

  const diferencia = Number(montoRecibido || 0) - Number(detalle?.monto_declarado || 0);

  return (
    <Layout rol="admin">
      <div className="mb-8">
        <h1 className="text-3xl font-title text-gray-900">Caja contraentrega</h1>
        <p className="text-sm text-gray-500 mt-1">Control de cortes y verificacion de dinero recibido en sede.</p>
      </div>

      {errorMsg && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">{errorMsg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <InfoCard label="En circulacion" value={formatCOP(resumen.enCirculacion)} />
        <InfoCard label="Recaudado hoy" value={formatCOP(resumen.recaudadoHoy)} />
        <InfoCard label="Entregado a sede" value={formatCOP(resumen.entregadoSede)} />
        <InfoCard label="Pendiente entrega" value={formatCOP(resumen.pendienteEntrega)} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros((prev) => ({ ...prev, estado: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="verificado">Verificado</option>
            <option value="discrepancia">Discrepancia</option>
          </select>
          <input
            value={filtros.repartidor_id}
            onChange={(e) => setFiltros((prev) => ({ ...prev, repartidor_id: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
            placeholder="ID repartidor (opcional)"
          />
          <button onClick={() => cargarCortes(filtros)} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Buscar</button>
          <button onClick={() => { setFiltros({ estado: '', repartidor_id: '' }); cargarCortes({}); }} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Limpiar</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
              <tr>
                <th className="p-4 text-left">Repartidor</th>
                <th className="p-4 text-left">Guias contraentrega</th>
                <th className="p-4 text-left">Monto declarado</th>
                <th className="p-4 text-left">Estado</th>
                <th className="p-4 text-left">Fecha</th>
                <th className="p-4 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="p-6 text-center text-gray-400">Cargando...</td></tr>
              ) : cortes.length === 0 ? (
                <tr><td colSpan="6" className="p-6 text-center text-gray-400">No hay cortes para los filtros seleccionados.</td></tr>
              ) : cortes.map((corte) => (
                <tr key={corte.id} className="hover:bg-gray-50">
                  <td className="p-4 font-semibold text-gray-800">{corte.repartidor?.nombre}</td>
                  <td className="p-4">{corte.total_guias} guias</td>
                  <td className="p-4 font-semibold">{formatCOP(corte.monto_declarado)}</td>
                  <td className="p-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold capitalize ${ESTADO_STYLES[corte.estado] || 'bg-gray-100 text-gray-700'}`}>
                      {corte.estado}
                    </span>
                  </td>
                  <td className="p-4">{formatFecha(corte.created_at)}</td>
                  <td className="p-4 text-right">
                    {corte.estado === 'pendiente' ? (
                      <button
                        onClick={() => abrirVerificacion(corte.id)}
                        className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-primary text-white"
                      >
                        Verificar
                      </button>
                    ) : (
                      <button
                        onClick={() => abrirVerificacion(corte.id)}
                        className="px-3 py-2 text-xs font-bold rounded-xl bg-gray-100 text-gray-600"
                      >
                        Ver detalle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && detalle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-gray-100 shadow-2xl">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-title text-xl text-gray-900">Verificar corte de contraentrega</h3>
              <p className="text-sm text-gray-500 mt-1">Repartidor: {detalle.repartidor_id}</p>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                {(detalle.guias || []).map((g) => (
                  <div key={g.id} className="py-2 border-b border-gray-100 last:border-b-0 text-sm flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-700">{g.numero_guia}</p>
                      <p className="text-xs text-gray-500">{g.nombre_destinatario}</p>
                    </div>
                    <span className="font-semibold text-gray-800">{formatCOP(g.cod_cobrado || g.monto_cod)}</span>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Monto declarado</label>
                <input disabled value={formatCOP(detalle.monto_declarado)} className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-gray-100 text-sm" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Monto recibido</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                  disabled={detalle.estado !== 'pendiente'}
                />
              </div>

              {diferencia !== 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>Discrepancia detectada: {formatCOP(diferencia)}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Observaciones</label>
                <textarea
                  rows="3"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                  disabled={detalle.estado !== 'pendiente'}
                />
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cerrar</button>
              {detalle.estado === 'pendiente' && (
                <button
                  onClick={confirmarVerificacion}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-60"
                >
                  <CheckCircle2 size={14} /> {saving ? 'Guardando...' : 'Confirmar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
