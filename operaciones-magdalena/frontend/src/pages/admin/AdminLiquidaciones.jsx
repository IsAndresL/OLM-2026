import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileText, PlusCircle, Wallet } from 'lucide-react';
import Layout from '../../components/Layout';
import { liquidacionesService, usuariosService, descargarArchivo } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCOP, formatFecha, formatPeriodo } from '../../utils/formato';
import useAlerta from '../../hooks/useAlerta';
import Alerta from '../../components/Alerta';

const ESTADO_STYLES = {
  borrador: 'bg-amber-100 text-amber-700',
  aprobada: 'bg-blue-100 text-blue-700',
  pagada: 'bg-emerald-100 text-emerald-700',
};

export default function AdminLiquidaciones() {
  const { token } = useAuth();
  const { alerta, mostrarAlerta, cerrarAlerta } = useAlerta();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [repartidores, setRepartidores] = useState([]);

  const [filtros, setFiltros] = useState({
    repartidor_id: '',
    estado: '',
    fecha_desde: '',
    fecha_hasta: '',
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [nuevoForm, setNuevoForm] = useState({
    repartidor_id: '',
    fecha_desde: '',
    fecha_hasta: '',
    observaciones: '',
  });

  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  async function cargarBase() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [rep, liq] = await Promise.all([
        usuariosService.listar(token, { rol: 'repartidor', activo: true, limit: 300 }),
        liquidacionesService.listar(token, filtros),
      ]);
      const repData = Array.isArray(rep) ? rep : rep?.data || [];
      setRepartidores(repData);
      setLiquidaciones(liq || []);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar el modulo de liquidaciones');
      mostrarAlerta('error', err.message || 'No se pudo cargar el modulo de liquidaciones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarBase();
  }, []);

  async function filtrar() {
    setLoading(true);
    setErrorMsg('');
    try {
      const liq = await liquidacionesService.listar(token, filtros);
      setLiquidaciones(liq || []);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo filtrar la lista');
      mostrarAlerta('error', err.message || 'No se pudo filtrar la lista');
    } finally {
      setLoading(false);
    }
  }

  async function calcularPreview() {
    if (!nuevoForm.repartidor_id || !nuevoForm.fecha_desde || !nuevoForm.fecha_hasta) {
      mostrarAlerta('warning', 'Debes completar repartidor y rango de fechas para calcular.');
      return;
    }

    setCalcLoading(true);
    setErrorMsg('');
    try {
      const result = await liquidacionesService.calcular(token, {
        repartidor_id: nuevoForm.repartidor_id,
        fecha_desde: nuevoForm.fecha_desde,
        fecha_hasta: nuevoForm.fecha_hasta,
      });
      setCalcResult(result);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo calcular la liquidacion');
      mostrarAlerta('error', err.message || 'No se pudo calcular la liquidacion');
    } finally {
      setCalcLoading(false);
    }
  }

  async function guardarLiquidacion() {
    if (!calcResult) return;

    setSaveLoading(true);
    setErrorMsg('');
    try {
      await liquidacionesService.crear(token, nuevoForm);
      setModalOpen(false);
      setCalcResult(null);
      setNuevoForm({ repartidor_id: '', fecha_desde: '', fecha_hasta: '', observaciones: '' });
      await filtrar();
      mostrarAlerta('success', 'Liquidacion creada correctamente.');
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo guardar la liquidacion');
      mostrarAlerta('error', err.message || 'No se pudo guardar la liquidacion');
    } finally {
      setSaveLoading(false);
    }
  }

  async function abrirDetalle(id) {
    setDetalleLoading(true);
    try {
      const data = await liquidacionesService.detalle(token, id);
      setDetalle(data);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar el detalle');
      mostrarAlerta('error', err.message || 'No se pudo cargar el detalle');
    } finally {
      setDetalleLoading(false);
    }
  }

  async function avanzarEstado(estado) {
    if (!detalle) return;

    try {
      await liquidacionesService.cambiarEstado(token, detalle.id, {
        estado,
        observaciones: detalle.observaciones || '',
      });
      const refreshed = await liquidacionesService.detalle(token, detalle.id);
      setDetalle(refreshed);
      await filtrar();
      mostrarAlerta('success', `Estado actualizado a ${estado}.`);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo actualizar el estado');
      mostrarAlerta('error', err.message || 'No se pudo actualizar el estado');
    }
  }

  async function descargarPdf(id) {
    try {
      const blob = await liquidacionesService.descargarPDF(token, id);
      descargarArchivo(blob, `liquidacion-${String(id).slice(0, 8)}.pdf`);
      mostrarAlerta('success', 'PDF generado correctamente.');
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo descargar el PDF');
      mostrarAlerta('error', err.message || 'No se pudo descargar el PDF');
    }
  }

  const puedeAprobar = detalle?.estado === 'borrador';
  const puedePagar = detalle?.estado === 'aprobada';

  const resumenPreview = useMemo(() => {
    if (!calcResult) return null;
    return calcResult.totales;
  }, [calcResult]);

  return (
    <Layout rol="admin">
      <Alerta {...alerta} onClose={cerrarAlerta} />
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-title text-gray-900">Liquidaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Calcula, guarda y cierra pagos de repartidores.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-5 py-3 rounded-2xl bg-brand-primary text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 flex items-center gap-2"
        >
          <PlusCircle size={16} /> Nueva liquidacion
        </button>
      </div>

      {errorMsg && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">{errorMsg}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={filtros.repartidor_id}
            onChange={(e) => setFiltros((prev) => ({ ...prev, repartidor_id: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
          >
            <option value="">Todos los repartidores</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre_completo}</option>
            ))}
          </select>
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros((prev) => ({ ...prev, estado: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="aprobada">Aprobada</option>
            <option value="pagada">Pagada</option>
          </select>
          <input
            type="date"
            value={filtros.fecha_desde}
            onChange={(e) => setFiltros((prev) => ({ ...prev, fecha_desde: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
          />
          <input
            type="date"
            value={filtros.fecha_hasta}
            onChange={(e) => setFiltros((prev) => ({ ...prev, fecha_hasta: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
          />
          <button onClick={filtrar} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Buscar</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
                <tr>
                  <th className="p-4 text-left">Repartidor</th>
                  <th className="p-4 text-left">Periodo</th>
                  <th className="p-4 text-left">Total</th>
                  <th className="p-4 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan="4" className="p-6 text-center text-gray-400">Cargando...</td></tr>
                ) : liquidaciones.length === 0 ? (
                  <tr><td colSpan="4" className="p-6 text-center text-gray-400">No hay liquidaciones para los filtros seleccionados.</td></tr>
                ) : liquidaciones.map((liq) => (
                  <tr key={liq.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => abrirDetalle(liq.id)}>
                    <td className="p-4 font-semibold text-gray-800">{liq.repartidor?.nombre}</td>
                    <td className="p-4">{formatPeriodo(liq.periodo?.desde, liq.periodo?.hasta)}</td>
                    <td className="p-4 font-bold text-gray-900">{formatCOP(liq.total_a_pagar)}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold capitalize ${ESTADO_STYLES[liq.estado] || 'bg-gray-100 text-gray-600'}`}>
                        {liq.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {detalleLoading && <p className="text-sm text-gray-400">Cargando detalle...</p>}
          {!detalleLoading && !detalle && <p className="text-sm text-gray-400">Selecciona una liquidacion para ver su detalle.</p>}
          {!detalleLoading && detalle && (
            <div>
              <h3 className="font-title text-xl text-gray-900 mb-2">Detalle</h3>
              <p className="text-sm text-gray-500 mb-3">{detalle.repartidor?.nombre_completo || 'Repartidor'}</p>
              <p className="text-sm text-gray-600 mb-1">Periodo: {formatPeriodo(detalle.fecha_desde, detalle.fecha_hasta)}</p>
              <p className="text-sm text-gray-600 mb-1">Estado: <span className="font-semibold capitalize">{detalle.estado}</span></p>
              <p className="text-sm text-gray-600 mb-4">Total a pagar: <span className="font-bold text-gray-900">{formatCOP(detalle.total_a_pagar)}</span></p>

              <div className="rounded-xl border border-gray-100 p-3 max-h-56 overflow-y-auto mb-4">
                {(detalle.detalle_guias || []).map((row) => (
                  <div key={row.guia_id} className="py-2 border-b border-gray-100 last:border-b-0">
                    <p className="text-xs font-bold text-gray-700">{row.numero_guia}</p>
                    <p className="text-xs text-gray-500">{row.nombre_destinatario}</p>
                    <p className="text-xs text-gray-700 capitalize">{row.tipo} · {formatCOP(row.monto)}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {puedeAprobar && (
                  <button
                    onClick={() => avanzarEstado('aprobada')}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700"
                  >
                    Aprobar
                  </button>
                )}
                {puedePagar && (
                  <button
                    onClick={() => avanzarEstado('pagada')}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700"
                  >
                    Marcar pagada
                  </button>
                )}
                <button
                  onClick={() => descargarPdf(detalle.id)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-900 text-white inline-flex items-center gap-1"
                >
                  <Download size={14} /> PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl border border-gray-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-title text-xl text-gray-900">Nueva liquidacion</h3>
              <button onClick={() => { setModalOpen(false); setCalcResult(null); }} className="text-gray-400 hover:text-gray-600">Cerrar</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={nuevoForm.repartidor_id}
                  onChange={(e) => setNuevoForm((prev) => ({ ...prev, repartidor_id: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
                >
                  <option value="">Selecciona repartidor</option>
                  {repartidores.map((r) => <option key={r.id} value={r.id}>{r.nombre_completo}</option>)}
                </select>
                <input
                  type="date"
                  value={nuevoForm.fecha_desde}
                  onChange={(e) => setNuevoForm((prev) => ({ ...prev, fecha_desde: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
                <input
                  type="date"
                  value={nuevoForm.fecha_hasta}
                  onChange={(e) => setNuevoForm((prev) => ({ ...prev, fecha_hasta: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>

              <button
                onClick={calcularPreview}
                disabled={calcLoading}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold"
              >
                {calcLoading ? 'Calculando...' : 'Calcular'}
              </button>

              {resumenPreview && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-1 text-sm">
                  <p>Guias entregadas: {resumenPreview.entregadas} x {formatCOP(calcResult.tarifa.base)} = <span className="font-bold">{formatCOP(resumenPreview.subtotal_guias)}</span></p>
                  <p>Novedades: {resumenPreview.novedades} x {formatCOP(calcResult.tarifa.novedad)} = <span className="font-bold">{formatCOP(resumenPreview.subtotal_novedades)}</span></p>
                  <p>Contraentrega recaudada: <span className="font-bold">{formatCOP(resumenPreview.total_cod_recaudado)}</span></p>
                  <p>Contraentrega entregada a sede: <span className="font-bold">{formatCOP(resumenPreview.total_cod_entregado)}</span></p>
                  <p>Diferencia contraentrega: <span className="font-bold">{formatCOP(resumenPreview.deduccion_cod)}</span></p>
                  <div className="pt-2 border-t border-gray-200 text-base font-bold text-gray-900">TOTAL A PAGAR: {formatCOP(resumenPreview.total_a_pagar)}</div>
                </div>
              )}

              <textarea
                value={nuevoForm.observaciones}
                onChange={(e) => setNuevoForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                rows="3"
                placeholder="Observaciones"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
              <button className="px-4 py-2 text-sm text-gray-600" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button
                onClick={guardarLiquidacion}
                disabled={!calcResult || saveLoading}
                className="px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold disabled:opacity-60 inline-flex items-center gap-1"
              >
                <Wallet size={14} /> {saveLoading ? 'Guardando...' : 'Guardar liquidacion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
