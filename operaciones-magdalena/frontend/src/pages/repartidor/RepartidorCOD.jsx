import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, HandCoins } from 'lucide-react';
import LayoutMovil from '../../components/LayoutMovil';
import { codService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCOP, formatFecha } from '../../utils/formato';

export default function RepartidorCOD() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [pendientes, setPendientes] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [montoDeclarado, setMontoDeclarado] = useState('');

  async function cargarPendientes() {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await codService.pendientesRepartidor(token);
      setPendientes(data || []);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cargar tu saldo pendiente de contraentrega');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarPendientes();
  }, []);

  const resumen = useMemo(() => {
    const total = pendientes.reduce((acc, g) => acc + Number(g.cod_cobrado || g.monto_cod || 0), 0);
    return { total, guias: pendientes.length };
  }, [pendientes]);

  function abrirModal() {
    setSelectedIds(pendientes.map((g) => g.guia_id));
    setMontoDeclarado(String(resumen.total));
    setOkMsg('');
    setModalOpen(true);
  }

  function toggleGuia(guiaId) {
    setSelectedIds((prev) => (
      prev.includes(guiaId)
        ? prev.filter((id) => id !== guiaId)
        : [...prev, guiaId]
    ));
  }

  const totalSeleccionado = useMemo(() => {
    return pendientes
      .filter((g) => selectedIds.includes(g.guia_id))
      .reduce((acc, g) => acc + Number(g.cod_cobrado || g.monto_cod || 0), 0);
  }, [pendientes, selectedIds]);

  async function confirmarEntrega() {
    if (selectedIds.length === 0) {
      setErrorMsg('Selecciona al menos una guia de contraentrega.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setOkMsg('');
    try {
      await codService.registrarCorte(token, {
        guia_ids: selectedIds,
        monto_declarado: Number(montoDeclarado),
      });
      setModalOpen(false);
      setOkMsg('Entrega registrada. El administrador la verificara.');
      await cargarPendientes();
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo registrar la entrega a sede');
    } finally {
      setSaving(false);
    }
  }

  return (
    <LayoutMovil title="Mi contraentrega">
      <div className="space-y-4 pb-24">
        {errorMsg && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{errorMsg}</div>}
        {okMsg && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm">{okMsg}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-1">Total a entregar en sede</p>
          <p className="text-3xl font-title text-gray-900">{formatCOP(resumen.total)}</p>
          <p className="text-sm text-gray-500 mt-1">{resumen.guias} guias de contraentrega cobradas</p>
          <button
            onClick={abrirModal}
            disabled={loading || pendientes.length === 0}
            className="mt-4 w-full rounded-2xl bg-brand-primary text-white py-3 text-sm font-black uppercase tracking-widest disabled:opacity-50"
          >
            Registrar entrega a sede
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-title text-lg text-gray-900 mb-3">Detalle de cobros pendientes</h3>
          {loading ? (
            <p className="text-sm text-gray-400">Cargando...</p>
          ) : pendientes.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-sm text-gray-500">No tienes saldo pendiente de contraentrega por entregar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendientes.map((guia) => (
                <div key={guia.guia_id} className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-gray-500">{guia.numero_guia}</p>
                      <p className="text-sm font-semibold text-gray-800">{guia.nombre_destinatario}</p>
                      <p className="text-xs text-gray-500">Cobrado en: {guia.cod_metodo || '—'}</p>
                      <p className="text-xs text-gray-500">Entrega: {formatFecha(guia.fecha_entrega)}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{formatCOP(guia.cod_cobrado || guia.monto_cod)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-title text-lg text-gray-900">Registrar entrega a sede</h3>
              <p className="text-sm text-gray-500 mt-1">Declaras entrega por {formatCOP(totalSeleccionado)} en {selectedIds.length} guias.</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-2">
                {pendientes.map((g) => (
                  <label key={g.guia_id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(g.guia_id)}
                        onChange={() => toggleGuia(g.guia_id)}
                        className="rounded border-gray-300 text-brand-primary"
                      />
                      <div>
                        <p className="text-xs font-bold text-gray-700">{g.numero_guia}</p>
                        <p className="text-xs text-gray-500">{g.nombre_destinatario}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">{formatCOP(g.cod_cobrado || g.monto_cod)}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Monto que vas a entregar</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={montoDeclarado}
                  onChange={(e) => setMontoDeclarado(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button
                onClick={confirmarEntrega}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-60"
              >
                <HandCoins size={14} /> {saving ? 'Guardando...' : 'Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutMovil>
  );
}
