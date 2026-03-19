import { useEffect, useMemo, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import Layout from '../../components/Layout';
import { tarifasService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCOP } from '../../utils/formato';

function TarifaModal({ open, onClose, onSave, title, fields, initialValues, loading }) {
  const [form, setForm] = useState(initialValues);

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-title text-lg text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={18} className="mx-auto" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(form);
          }}
          className="p-5 space-y-4"
        >
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form[field.key] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                required
              />
            </div>
          ))}
          <div className="pt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-brand-primary text-white text-sm font-bold disabled:opacity-60 flex items-center gap-2"
            >
              <Save size={14} /> {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminTarifas() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [tarifasRepartidores, setTarifasRepartidores] = useState([]);
  const [tarifasEmpresas, setTarifasEmpresas] = useState([]);

  const [modalConfig, setModalConfig] = useState({ open: false, type: null, item: null });

  const modalFields = useMemo(() => {
    if (modalConfig.type === 'repartidor') {
      return [
        { key: 'tarifa_base', label: 'Tarifa por entregada' },
        { key: 'tarifa_novedad', label: 'Tarifa por novedad' },
      ];
    }
    return [
      { key: 'tarifa_base', label: 'Tarifa por guia' },
      { key: 'tarifa_cod', label: 'Comision contraentrega' },
    ];
  }, [modalConfig.type]);

  async function cargarDatos() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [rep, emp] = await Promise.all([
        tarifasService.listarRepartidores(token),
        tarifasService.listarEmpresas(token),
      ]);
      setTarifasRepartidores(rep || []);
      setTarifasEmpresas(emp || []);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudieron cargar las tarifas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  function abrirModal(type, item) {
    setModalConfig({ open: true, type, item });
  }

  function cerrarModal() {
    setModalConfig({ open: false, type: null, item: null });
  }

  async function guardarTarifa(values) {
    if (!modalConfig.item) return;

    setSaving(true);
    setErrorMsg('');
    try {
      if (modalConfig.type === 'repartidor') {
        await tarifasService.guardarRepartidor(token, modalConfig.item.repartidor.id, {
          tarifa_base: Number(values.tarifa_base),
          tarifa_novedad: Number(values.tarifa_novedad),
        });
      } else {
        await tarifasService.guardarEmpresa(token, modalConfig.item.empresa.id, {
          tarifa_base: Number(values.tarifa_base),
          tarifa_cod: Number(values.tarifa_cod),
        });
      }

      cerrarModal();
      await cargarDatos();
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo guardar la tarifa');
    } finally {
      setSaving(false);
    }
  }

  const initialValues = modalConfig.item?.tarifa || {
    tarifa_base: '',
    tarifa_novedad: '',
    tarifa_cod: '',
  };

  return (
    <Layout rol="admin">
      <div className="mb-8">
        <h1 className="text-3xl font-title text-gray-900">Tarifas</h1>
        <p className="text-sm text-gray-500 font-body mt-1">Configura tarifas de repartidores y empresas aliadas.</p>
      </div>

      {errorMsg && (
        <div className="mb-5 p-3 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">{errorMsg}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-title text-xl text-gray-900">Tarifas de repartidores</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
              <tr>
                <th className="p-4 text-left">Repartidor</th>
                <th className="p-4 text-left">Por entregada</th>
                <th className="p-4 text-left">Por novedad</th>
                <th className="p-4 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="4" className="p-6 text-center text-gray-400">Cargando...</td></tr>
              ) : tarifasRepartidores.length === 0 ? (
                <tr><td colSpan="4" className="p-6 text-center text-gray-400">No hay repartidores disponibles.</td></tr>
              ) : tarifasRepartidores.map((item) => (
                <tr key={item.repartidor.id} className="hover:bg-gray-50">
                  <td className="p-4 font-semibold text-gray-800">{item.repartidor.nombre_completo}</td>
                  <td className="p-4">{item.tarifa ? formatCOP(item.tarifa.tarifa_base) : 'Sin tarifa'}</td>
                  <td className="p-4">{item.tarifa ? formatCOP(item.tarifa.tarifa_novedad) : '—'}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => abrirModal('repartidor', item)}
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      <Pencil size={14} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-title text-xl text-gray-900">Tarifas de empresas aliadas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
              <tr>
                <th className="p-4 text-left">Empresa</th>
                <th className="p-4 text-left">Por guia</th>
                <th className="p-4 text-left">Comision contraentrega</th>
                <th className="p-4 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="4" className="p-6 text-center text-gray-400">Cargando...</td></tr>
              ) : tarifasEmpresas.length === 0 ? (
                <tr><td colSpan="4" className="p-6 text-center text-gray-400">No hay empresas registradas.</td></tr>
              ) : tarifasEmpresas.map((item) => (
                <tr key={item.empresa.id} className="hover:bg-gray-50">
                  <td className="p-4 font-semibold text-gray-800">{item.empresa.nombre}</td>
                  <td className="p-4">{item.tarifa ? formatCOP(item.tarifa.tarifa_base) : 'Sin tarifa'}</td>
                  <td className="p-4">{item.tarifa ? formatCOP(item.tarifa.tarifa_cod) : '—'}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => abrirModal('empresa', item)}
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      <Pencil size={14} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TarifaModal
        open={modalConfig.open}
        onClose={cerrarModal}
        onSave={guardarTarifa}
        loading={saving}
        title={modalConfig.type === 'repartidor' ? `Configurar tarifa: ${modalConfig.item?.repartidor?.nombre_completo || ''}` : `Configurar tarifa: ${modalConfig.item?.empresa?.nombre || ''}`}
        fields={modalFields}
        initialValues={initialValues}
      />
    </Layout>
  );
}
