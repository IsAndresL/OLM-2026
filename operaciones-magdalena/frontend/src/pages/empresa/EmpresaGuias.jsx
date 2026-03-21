import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { guiasService, etiquetasService, descargarArchivo, zonasService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import BadgeEstado from '../../components/BadgeEstado';

const columnasObligatoriasBulk = [
  'nombre_remitente',
  'nombre_destinatario',
  'telefono_destinatario',
  'direccion_destinatario',
  'ciudad_destino',
];

const columnasOpcionalesBulk = [
  'barrio',
  'descripcion_paquete',
  'peso_kg',
  'valor_declarado',
  'zona_id',
  'lat',
  'lng',
];

const ayudaColumnasBulk = {
  nombre_remitente: 'Persona o empresa que envia el paquete.',
  nombre_destinatario: 'Persona que recibe el paquete.',
  telefono_destinatario: 'Telefono de contacto del destinatario.',
  direccion_destinatario: 'Direccion exacta de entrega.',
  ciudad_destino: 'Ciudad donde se entrega la guia.',
  barrio: 'Barrio para mejorar zona y ruta.',
  descripcion_paquete: 'Que contiene el envio.',
  peso_kg: 'Peso del paquete en kilogramos.',
  valor_declarado: 'Valor comercial declarado del paquete.',
  zona_id: 'UUID de zona (si ya lo tienes).',
  lat: 'Latitud del punto de entrega.',
  lng: 'Longitud del punto de entrega.',
};

export default function EmpresaGuias() {
  const { token } = useAuth();
  
  // States
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filtros, setFiltros] = useState({
    page: 1, limit: 50, q: '', estado: '', fecha_desde: '', fecha_hasta: ''
  });
  
  // Selection
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Modals
  const [isModalCrearOpen, setIsModalCrearOpen] = useState(false);
  const [isModalBulkOpen, setIsModalBulkOpen] = useState(false);
  const [isModalDetalleOpen, setIsModalDetalleOpen] = useState(false);
  const [guiaActual, setGuiaActual] = useState(null);
  
  // Loading states
  const [actionLoading, setActionLoading] = useState(false);
  const [zonaDetectadaCrear, setZonaDetectadaCrear] = useState(null);

  useEffect(() => {
    cargarGuias();
  }, [filtros.page, filtros.estado, filtros.fecha_desde, filtros.fecha_hasta]);

  const cargarGuias = async () => {
    setLoading(true);
    try {
      const res = await guiasService.listar(token, filtros);
      setGuias(res.data);
      setTotal(res.total);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (filtros.page !== 1) {
      setFiltros({ ...filtros, page: 1 });
      return;
    }
    cargarGuias();
  };

  const limpiarFiltros = () => {
    setFiltros({ page: 1, limit: 50, q: '', estado: '', fecha_desde: '', fecha_hasta: '' });
  };

  const verDetalle = async (id) => {
    try {
      const g = await guiasService.obtener(token, id);
      setGuiaActual(g);
      setIsModalDetalleOpen(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const descargarEtiqueta = async (id, numero) => {
    try {
      const blob = await etiquetasService.descargar(token, id);
      descargarArchivo(blob, `${numero}.pdf`);
    } catch (err) {
      alert(err.message);
    }
  };

  const crearGuia = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
    try {
      await guiasService.crear(token, data);
      setIsModalCrearOpen(false);
      setZonaDetectadaCrear(null);
      cargarGuias();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const detectarZonaPorBarrio = async (barrio) => {
    const value = (barrio || '').trim();
    if (!value) {
      setZonaDetectadaCrear(null);
      return;
    }
    try {
      const zona = await zonasService.detectar(token, value);
      setZonaDetectadaCrear(zona || null);
    } catch (_err) {
      setZonaDetectadaCrear(null);
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    const file = e.target.archivo.files[0];
    if (!file) return;
    try {
      const res = await guiasService.bulkUpload(token, file);
      alert(`Completado: ${res.creadas} guías creadas. ${res.errores} errores.`);
      if (res.errores > 0) console.table(res.detalle_errores);
      setIsModalBulkOpen(false);
      cargarGuias();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const descargarBulk = async () => {
    if (selectedIds.length === 0) return;
    setActionLoading(true);
    try {
      const blob = await etiquetasService.bulk(token, selectedIds);
      descargarArchivo(blob, `etiquetas-${new Date().getTime()}.pdf`);
      setSelectedIds([]);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const descargarPlantillaBulk = (conEjemplo = false) => {
    const headers = [...columnasObligatoriasBulk, ...columnasOpcionalesBulk];
    const filas = [headers];

    if (conEjemplo) {
      filas.push(
        [
          'Comercial OLM',
          'Maria Gomez',
          '3015551122',
          'Carrera 15 # 8-90',
          'Santa Marta',
          'Prado',
          'Sobre documentos',
          '0.3',
          '50000',
          '',
          '',
          '',
        ]
      );
    }

    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(18, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Guias');
    XLSX.writeFile(wb, conEjemplo ? 'plantilla-guias-ejemplo.xlsx' : 'plantilla-guias-vacia.xlsx');
  };

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(x => x !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === guias.length) setSelectedIds([]);
    else setSelectedIds(guias.map(g => g.id));
  };

  return (
    <Layout rol="empresa">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-title text-brand-dark mb-1">Mis Guías</h1>
          <p className="text-sm text-gray-500 font-body">Gestiona los envíos de tu empresa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedIds.length > 0 && (
            <button onClick={descargarBulk} disabled={actionLoading} className="bg-brand-navy hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              {actionLoading ? 'Generando...' : `⬇️ Descargar Etiquetas (${selectedIds.length})`}
            </button>
          )}
          <button onClick={() => setIsModalBulkOpen(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Subir guias en formato Excel
          </button>
          <button onClick={() => setIsModalCrearOpen(true)} className="bg-brand-primary hover:bg-brand-light text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors">
            + Nueva Guía
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-100">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Buscar</label>
            <input type="text" placeholder="Número, destinatario, teléfono..." 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-brand-light focus:border-brand-light"
              value={filtros.q} onChange={e => setFiltros({...filtros, q: e.target.value})} />
          </div>
          <div className="w-40">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Estado</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={filtros.estado} onChange={e => setFiltros({...filtros, estado: e.target.value})}>
              <option value="">Todos</option>
              <option value="registrado">Registrado</option>
              <option value="asignado">Asignado</option>
              <option value="en_ruta">En Ruta</option>
              <option value="entregado">Entregado</option>
              <option value="no_contesto">No Contestó</option>
              <option value="direccion_incorrecta">Dir. Incorrecta</option>
              <option value="reagendar">Reagendar</option>
              <option value="devuelto">Devuelto</option>
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Desde</label>
            <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={filtros.fecha_desde} onChange={e => setFiltros({...filtros, fecha_desde: e.target.value})} />
          </div>
          <div className="w-32">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Hasta</label>
            <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={filtros.fecha_hasta} onChange={e => setFiltros({...filtros, fecha_hasta: e.target.value})} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700">Buscar</button>
            <button type="button" onClick={limpiarFiltros} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">Limpiar</button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 font-subtitle uppercase text-xs">
              <tr>
                <th className="p-4 w-10">
                  <input type="checkbox" onChange={toggleSelectAll} checked={guias.length > 0 && selectedIds.length === guias.length} className="rounded border-gray-300 text-brand-primary focus:ring-brand-light" />
                </th>
                <th className="p-4 font-semibold">Guía</th>
                <th className="p-4 font-semibold">Destino</th>
                <th className="p-4 font-semibold">Repartidor</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-body">
              {loading ? (
                <tr><td colSpan="7" className="p-8 text-center text-gray-400">Cargando guías...</td></tr>
              ) : guias.length === 0 ? (
                <tr><td colSpan="7" className="p-8 text-center text-gray-400">No hay guías encontradas.</td></tr>
              ) : guias.map(g => (
                <tr key={g.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="p-4">
                    <input type="checkbox" checked={selectedIds.includes(g.id)} onChange={() => toggleSelect(g.id)} className="rounded border-gray-300 text-brand-primary focus:ring-brand-light" />
                  </td>
                  <td className="p-4">
                    <button onClick={() => verDetalle(g.id)} className="font-title text-brand-primary hover:text-brand-light hover:underline">
                      {g.numero_guia}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-gray-800">{g.nombre_destinatario}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{g.direccion_destinatario}, {g.ciudad_destino}</div>
                  </td>
                  <td className="p-4">{g.repartidor_nombre ? <span className="text-gray-800">{g.repartidor_nombre}</span> : <span className="text-gray-400 text-xs italic">Sin asignar</span>}</td>
                  <td className="p-4"><BadgeEstado estado={g.estado_actual} /></td>
                  <td className="p-4 text-xs">{new Date(g.created_at).toLocaleDateString('es-CO')}</td>
                  <td className="p-4 text-right space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => descargarEtiqueta(g.id, g.numero_guia)} className="text-gray-500 hover:text-brand-primary" title="Etiqueta PDF">📄</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-between items-center text-sm text-gray-600 bg-gray-50/30">
          <div>Mostrando página {filtros.page} · Total: <span className="font-semibold text-gray-900">{total}</span> guías</div>
          <div className="flex gap-2">
            <button disabled={filtros.page === 1} onClick={() => setFiltros({...filtros, page: filtros.page - 1})} className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50">Anterior</button>
            <button disabled={guias.length < filtros.limit} onClick={() => setFiltros({...filtros, page: filtros.page + 1})} className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      </div>

      {isModalCrearOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-title text-xl text-brand-dark">Nueva Guía</h3>
              <button onClick={() => setIsModalCrearOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 overflow-y-auto font-body">
              <form id="crearGuiaForm" onSubmit={crearGuia} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Remitente *</label>
                    <input type="text" name="nombre_remitente" required className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div className="md:col-span-2 pt-2 border-t border-gray-100">
                    <h4 className="text-xs font-bold text-brand-primary uppercase mb-3">Datos del Destinatario</h4>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre *</label>
                    <input type="text" name="nombre_destinatario" required className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Teléfono *</label>
                    <input type="text" name="telefono_destinatario" required className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Dirección *</label>
                    <input type="text" name="direccion_destinatario" required className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Barrio</label>
                    <input type="text" name="barrio" onBlur={(e) => detectarZonaPorBarrio(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" />
                    {zonaDetectadaCrear && (
                      <p className="mt-2 text-xs inline-flex bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                        Zona detectada: {zonaDetectadaCrear.zona_nombre}
                      </p>
                    )}
                    <input type="hidden" name="zona_id" value={zonaDetectadaCrear?.zona_id || ''} readOnly />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Ciudad *</label>
                    <input type="text" name="ciudad_destino" required defaultValue="Santa Marta" className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div className="md:col-span-2 pt-2 border-t border-gray-100">
                    <h4 className="text-xs font-bold text-brand-primary uppercase mb-3">Detalles del Paquete</h4>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción</label>
                    <input type="text" name="descripcion_paquete" className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Peso (kg)</label>
                    <input type="number" step="0.01" name="peso_kg" className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Valor Declarado ($)</label>
                    <input type="number" name="valor_declarado" className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Observaciones</label>
                    <textarea name="observaciones" rows="2" className="w-full p-2 border border-gray-300 rounded-lg"></textarea>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setIsModalCrearOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancelar</button>
              <button type="submit" form="crearGuiaForm" disabled={actionLoading} className="px-5 py-2 text-sm font-medium text-white bg-brand-primary hover:bg-brand-light rounded-lg shadow-sm disabled:opacity-50">
                {actionLoading ? 'Guardando...' : 'Crear Guía'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalBulkOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-title text-lg text-brand-dark">Subir guias en formato Excel</h3>
              <button onClick={() => setIsModalBulkOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 font-body overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                    <h4 className="font-subtitle text-sm font-bold text-blue-900 mb-2">Formato permitido</h4>
                    <p className="text-xs text-blue-800">Acepta archivos .xlsx o .csv. Maximo 5MB. Solo toma la primera hoja del Excel.</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h4 className="font-subtitle text-sm font-bold text-gray-900 mb-2">Columnas obligatorias</h4>
                    <div className="flex flex-wrap gap-2">
                      {columnasObligatoriasBulk.map((c) => (
                        <span key={c} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-100">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h4 className="font-subtitle text-sm font-bold text-gray-900 mb-2">Columnas opcionales</h4>
                    <div className="flex flex-wrap gap-2">
                      {columnasOpcionalesBulk.map((c) => (
                        <span key={c} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4">
                    <p className="text-xs text-amber-900">Como empresa no necesitas columna <strong>empresa_id</strong>, el sistema la asigna automaticamente.</p>
                    <p className="text-xs text-amber-900 mt-2">Si ves <strong>ing</strong> en algun archivo, es un error de escritura: debe ser <strong>lng</strong> (longitud).</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h4 className="font-subtitle text-sm font-bold text-gray-900 mb-2">Vista rapida de columnas</h4>
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-600 uppercase">
                          <tr>
                            <th className="p-2 text-left">Columna</th>
                            <th className="p-2 text-left">Tipo</th>
                            <th className="p-2 text-left">Ayuda corta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {columnasObligatoriasBulk.map((c) => (
                            <tr key={`req-${c}`}>
                              <td className="p-2 font-medium text-gray-800">{c}</td>
                              <td className="p-2 text-red-600">Obligatoria</td>
                              <td className="p-2 text-gray-600">{ayudaColumnasBulk[c]}</td>
                            </tr>
                          ))}
                          {columnasOpcionalesBulk.map((c) => (
                            <tr key={`opt-${c}`}>
                              <td className="p-2 font-medium text-gray-800">{c}</td>
                              <td className="p-2 text-emerald-600">Opcional</td>
                              <td className="p-2 text-gray-600">{ayudaColumnasBulk[c]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <h4 className="font-subtitle text-sm font-bold text-gray-900 mb-3">Plantillas descargables</h4>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => descargarPlantillaBulk(false)} className="px-3 py-2 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
                        Descargar plantilla vacia (XLSX)
                      </button>
                      <button type="button" onClick={() => descargarPlantillaBulk(true)} className="px-3 py-2 text-xs font-bold rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary">
                        Descargar plantilla con ejemplo (XLSX)
                      </button>
                    </div>
                  </div>
                  <form id="bulkForm" onSubmit={handleBulkUpload} className="rounded-xl border border-dashed border-gray-300 p-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-2">Selecciona archivo (.xlsx o .csv)</label>
                    <input type="file" name="archivo" accept=".xlsx,.csv" required className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" />
                  </form>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button onClick={() => setIsModalBulkOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600">Cancelar</button>
              <button type="submit" form="bulkForm" disabled={actionLoading} className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
                {actionLoading ? 'Importando...' : 'Importar Archivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalDetalleOpen && guiaActual && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="font-title text-xl text-brand-dark">{guiaActual.numero_guia}</h3>
                <p className="text-sm text-gray-500 font-body mt-1">Fecha: {new Date(guiaActual.created_at).toLocaleDateString('es-CO')}</p>
              </div>
              <div className="flex items-center gap-4">
                <BadgeEstado estado={guiaActual.estado_actual} />
                <button onClick={() => setIsModalDetalleOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto font-body flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Destino</h4>
                  <p className="font-semibold text-gray-800">{guiaActual.nombre_destinatario}</p>
                  <p className="text-sm text-gray-600">{guiaActual.direccion_destinatario}</p>
                  {guiaActual.barrio && <p className="text-sm text-gray-600">Barrio: {guiaActual.barrio}</p>}
                  <p className="text-sm text-gray-600">{guiaActual.ciudad_destino}</p>
                  <p className="text-sm text-gray-600 mt-1">📞 {guiaActual.telefono_destinatario}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Paquete</h4>
                    <p className="text-sm text-gray-800">{guiaActual.descripcion_paquete || 'Sin desc.'}</p>
                    <p className="text-sm text-gray-600 mt-1">{guiaActual.peso_kg ? `${guiaActual.peso_kg} kg` : ''}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Repartidor</h4>
                    <p className="text-sm text-gray-800 font-medium">{guiaActual.repartidor?.nombre_completo || 'Sin asignar'}</p>
                  </div>
                </div>
              </div>
              <div className="md:w-72 border-l border-gray-100 md:pl-6 pl-0 border-t md:border-t-0 pt-4 md:pt-0">
                <h4 className="text-xs font-bold text-brand-primary uppercase mb-4">Historial de Estados</h4>
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                  {guiaActual.historial?.map((h, i) => (
                    <div key={h.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white bg-brand-light text-white shadow shrink-0 ml-0 md:mx-auto md:group-hover:bg-brand-primary transition duration-300"></div>
                      <div className="w-[calc(100%-1.5rem)] md:w-[calc(50%-1.5rem)] pl-3 md:pl-0 md:odd:pr-3 md:even:pl-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-gray-800 uppercase"><BadgeEstado estado={h.estado} /></span>
                          <span className="text-[10px] text-gray-500 mt-0.5">{new Date(h.created_at).toLocaleString('es-CO')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!guiaActual.historial || guiaActual.historial.length === 0) && (
                    <p className="text-xs text-gray-400 italic">No hay historial</p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button onClick={() => descargarEtiqueta(guiaActual.id, guiaActual.numero_guia)} className="px-4 py-2 text-sm font-medium text-brand-dark bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">
                📄 Descargar Etiqueta
              </button>
              <button onClick={() => setIsModalDetalleOpen(false)} className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 rounded-lg">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}
