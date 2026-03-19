import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import BadgeEstado from '../../components/BadgeEstado';
import { 
  Plus, 
  FileDown, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  Trash2, 
  UserPlus, 
  FileText, 
  Phone, 
  MapPin, 
  Info,
  Calendar,
  Building,
  ChevronLeft,
  ChevronRight,
  X,
  Printer
} from 'lucide-react';
import { 
  guiasService, 
  codService,
  zonasService,
  empresasService, 
  usuariosService, 
  reportesService, 
  etiquetasService 
} from '../../services/api';
import useAlerta from '../../hooks/useAlerta';
import Alerta from '../../components/Alerta';

// Helper for file download
const descargarArchivo = (blob, nombre) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};



export default function AdminGuias() {
  const { token, hasPermission } = useAuth();
  const { alerta, cerrarAlerta } = useAlerta();
  const canCrearGuias = hasPermission('guias.create');
  const canEditarGuias = hasPermission('guias.edit');
  const canAsignarGuias = hasPermission('guias.assign');
  const canEliminarGuias = hasPermission('guias.delete');
  const canDescargarEtiquetas = hasPermission('etiquetas.generar');
  const tooltipSinPermiso = 'No tienes permiso para esta accion';
  
  // States
  const [guias, setGuias] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filtros, setFiltros] = useState({
    page: 1, limit: 50, q: '', estado: '', empresa_id: '', fecha_desde: '', fecha_hasta: ''
  });
  
  // Selection
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Modals
  const [isModalCrearOpen, setIsModalCrearOpen] = useState(false);
  const [isModalBulkOpen, setIsModalBulkOpen] = useState(false);
  const [isModalAsignarOpen, setIsModalAsignarOpen] = useState(false);
  const [isModalDetalleOpen, setIsModalDetalleOpen] = useState(false);
  const [isModalEditarOpen, setIsModalEditarOpen] = useState(false);
  const [guiaActual, setGuiaActual] = useState(null);

  
  // Loading states
  const [actionLoading, setActionLoading] = useState(false);
  const [zonaDetectadaCrear, setZonaDetectadaCrear] = useState(null);

  useEffect(() => {
    cargarDatosBase();
  }, []);

  useEffect(() => {
    cargarGuias();
  }, [filtros.page, filtros.estado, filtros.empresa_id, filtros.fecha_desde, filtros.fecha_hasta]);

  const cargarDatosBase = async () => {
    try {
      const [resEmpresas, resRepartidores] = await Promise.all([
        empresasService.listar(token),
        usuariosService.listar(token, { rol: 'repartidor', activo: true, limit: 100 })
      ]);
      setEmpresas(resEmpresas);
      // usuariosService.listar returns the raw array or a data object depending on backend
      const repartidoresData = Array.isArray(resRepartidores) ? resRepartidores : (resRepartidores?.data || []);
      setRepartidores(repartidoresData);
    } catch (err) {
      console.error('Error cargando datos base:', err);
    }
  };

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
    setFiltros({ ...filtros, page: 1 });
    cargarGuias();
  };

  const limpiarFiltros = () => {
    setFiltros({ page: 1, limit: 50, q: '', estado: '', empresa_id: '', fecha_desde: '', fecha_hasta: '' });
  };

  // ── ACCIONES INDIVIDUALES ──
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
    if (!canDescargarEtiquetas) {
      alert('No tienes permiso para generar etiquetas');
      return;
    }

    try {
      const blob = await etiquetasService.descargar(token, id);
      descargarArchivo(blob, `${numero}.pdf`);
    } catch (err) {
      alert(err.message);
    }
  };

  const eliminarGuia = async (id) => {
    if (!canEliminarGuias) {
      alert('No tienes permiso para eliminar guias');
      return;
    }

    if (!confirm('¿Seguro que deseas eliminar esta guía?')) return;
    try {
      await guiasService.eliminar(token, id);
      cargarGuias();
    } catch (err) {
      alert(err.message);
    }
  };

  const abrirAsignar = (guia) => {
    if (!canAsignarGuias) {
      alert('No tienes permiso para asignar guias');
      return;
    }

    setGuiaActual(guia);
    setIsModalAsignarOpen(true);
  };

  const abrirEditar = (guia) => {
    if (!canEditarGuias) {
      alert('No tienes permiso para editar guias');
      return;
    }

    setGuiaActual(guia);
    setIsModalEditarOpen(true);
  };

  const confirmarAsignacion = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    const repId = e.target.repartidor_id.value;
    try {
      await guiasService.asignar(token, guiaActual.id, repId);
      setIsModalAsignarOpen(false);
      cargarGuias();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const editarGuia = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    
    try {
      await guiasService.actualizar(token, guiaActual.id, data);
      setIsModalEditarOpen(false);
      cargarGuias();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };


  // ── CREAR GUÍA ──
  const crearGuia = async (e) => {
    e.preventDefault();
    if (!canCrearGuias) {
      alert('No tienes permiso para crear guias');
      return;
    }

    setActionLoading(true);
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());

    const activarCod = data.es_cod === 'on';
    const montoCod = data.monto_cod ? Number(data.monto_cod) : null;
    delete data.es_cod;
    delete data.monto_cod;
    
    // Convert to null if empty
    Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
    
    try {
      const nuevaGuia = await guiasService.crear(token, data);
      if (activarCod && montoCod && montoCod > 0) {
        await codService.activarCOD(token, nuevaGuia.id, { monto_cod: montoCod });
      }
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

  // ── BULK ──
  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!canCrearGuias) {
      alert('No tienes permiso para crear guias');
      return;
    }

    setActionLoading(true);
    const file = e.target.archivo.files[0];
    if (!file) return;
    
    try {
      const res = await guiasService.bulkUpload(token, file);
      alert(`Completado: ${res.creadas} guías creadas. ${res.errores} errores.`);
      if (res.errores > 0) {
        console.table(res.detalle_errores);
        alert('Revisa la consola para ver los detalles de los errores.');
      }
      setIsModalBulkOpen(false);
      cargarGuias();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const descargarBulk = async () => {
    if (!canDescargarEtiquetas) {
      alert('No tienes permiso para generar etiquetas');
      return;
    }

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

  const toggleSelect = (id) => {
    if (!canDescargarEtiquetas) return;
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(x => x !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const toggleSelectAll = () => {
    if (!canDescargarEtiquetas) return;
    if (selectedIds.length === guias.length) setSelectedIds([]);
    else setSelectedIds(guias.map(g => g.id));
  };

  return (
    <Layout rol="admin">

      <Alerta {...alerta} onClose={cerrarAlerta} />
      
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-title text-gray-900 mb-2">Gestión de Guías</h1>
          <p className="text-sm text-gray-500 font-body">Control total de envíos, logística y etiquetas dinámicas.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {selectedIds.length > 0 && canDescargarEtiquetas && (
            <button 
              onClick={descargarBulk} 
              disabled={actionLoading || !canDescargarEtiquetas} 
              title={!canDescargarEtiquetas ? tooltipSinPermiso : 'Descargar etiquetas seleccionadas'}
              className="bg-brand-navy hover:bg-gray-800 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-brand-navy/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer size={16} /> {actionLoading ? 'Generando...' : `Etiquetas (${selectedIds.length})`}
            </button>
          )}
          <button 
            onClick={() => setIsModalBulkOpen(true)} 
            disabled={!canCrearGuias}
            title={!canCrearGuias ? tooltipSinPermiso : 'Importar guias por Excel'}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button 
            onClick={() => setIsModalCrearOpen(true)} 
            disabled={!canCrearGuias}
            title={!canCrearGuias ? tooltipSinPermiso : 'Crear nueva guia'}
            className="bg-brand-primary hover:bg-brand-light text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-brand-primary/30 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={18} /> Nueva Guía
          </button>
        </div>
      </div>


      {/* FILTROS */}
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
          <div className="w-48">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Empresa</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={filtros.empresa_id} onChange={e => setFiltros({...filtros, empresa_id: e.target.value})}>
              <option value="">Todas</option>
              {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
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

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 font-subtitle uppercase text-xs">
              <tr>
                <th className="p-4 w-10">
                  <input type="checkbox" disabled={!canDescargarEtiquetas} title={!canDescargarEtiquetas ? tooltipSinPermiso : 'Seleccionar todas'} onChange={toggleSelectAll} checked={guias.length > 0 && selectedIds.length === guias.length} className="rounded border-gray-300 text-brand-primary focus:ring-brand-light disabled:opacity-40" />
                </th>
                <th className="p-4 font-semibold">Guía</th>
                <th className="p-4 font-semibold">Destino</th>
                <th className="p-4 font-semibold">Empresa</th>
                <th className="p-4 font-semibold">Repartidor</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-body">
              {loading ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-400">Cargando guías...</td></tr>
              ) : guias.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-400">No hay guías con estos filtros.</td></tr>
              ) : guias.map(g => (
                <tr key={g.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="p-4">
                    <input type="checkbox" disabled={!canDescargarEtiquetas} title={!canDescargarEtiquetas ? tooltipSinPermiso : 'Seleccionar para descarga masiva'} checked={selectedIds.includes(g.id)} onChange={() => toggleSelect(g.id)} className="rounded border-gray-300 text-brand-primary focus:ring-brand-light disabled:opacity-40" />
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
                  <td className="p-4">{g.empresa_nombre || '-'}</td>
                  <td className="p-4">{g.repartidor_nombre ? <span className="text-gray-800">{g.repartidor_nombre}</span> : <span className="text-gray-400 text-xs italic">Sin asignar</span>}</td>
                  <td className="p-4"><BadgeEstado estado={g.estado_actual} /></td>
                  <td className="p-4 text-xs">{new Date(g.created_at).toLocaleDateString('es-CO')}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => descargarEtiqueta(g.id, g.numero_guia)} 
                        disabled={!canDescargarEtiquetas}
                        className="p-2 text-gray-400 hover:text-brand-primary hover:bg-brand-light/10 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed" 
                        title={!canDescargarEtiquetas ? tooltipSinPermiso : 'Etiqueta PDF'}
                      >
                        <FileDown size={18} />
                      </button>
                      <button 
                        onClick={() => abrirEditar(g)} 
                        disabled={!canEditarGuias}
                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed" 
                        title={!canEditarGuias ? tooltipSinPermiso : 'Editar Datos'}
                      >
                        <FileText size={18} />
                      </button>
                      {g.estado_actual === 'registrado' && canAsignarGuias && (
                        <button 
                          onClick={() => abrirAsignar(g)} 
                          className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Asignar Repartidor"
                        >
                          <UserPlus size={18} />
                        </button>
                      )}
                      {(['registrado', 'direccion_incorrecta', 'no_contesto', 'reagendar'].includes(g.estado_actual)) && canEliminarGuias && (
                        <button 
                          onClick={() => eliminarGuia(g.id)} 
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" 
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

              ))}
            </tbody>
          </table>
        </div>
        
        {/* Paginación */}
        <div className="p-4 border-t border-gray-100 flex justify-between items-center text-sm text-gray-600 bg-gray-50/30">
          <div>
            Mostrando página {filtros.page} · Total: <span className="font-semibold text-gray-900">{total}</span> guías
          </div>
          <div className="flex gap-2">
            <button 
              disabled={filtros.page === 1} 
              onClick={() => setFiltros({...filtros, page: filtros.page - 1})}
              className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <button 
              disabled={guias.length < filtros.limit}
              onClick={() => setFiltros({...filtros, page: filtros.page + 1})}
              className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: Crear Guía */}
      {isModalCrearOpen && canCrearGuias && (
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
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Empresa *</label>
                    <select name="empresa_id" required className="w-full p-2 border border-gray-300 rounded-lg">
                      <option value="">Selecciona empresa...</option>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Remitente *</label>
                    <input type="text" name="nombre_remitente" required className="w-full p-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div className="md:col-span-2 mt-2 pt-4 border-t border-gray-100">
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
                  <div className="md:col-span-2 mt-2 pt-4 border-t border-gray-100">
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
                  <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <input type="checkbox" name="es_cod" className="rounded border-emerald-300 text-emerald-600" />
                      Requiere pago contraentrega
                    </label>
                    <div className="mt-2">
                      <label className="block text-xs font-bold text-emerald-800 mb-1">Monto contraentrega</label>
                      <input type="number" name="monto_cod" min="0" step="1" placeholder="45000" className="w-full md:w-64 p-2 border border-emerald-200 rounded-lg bg-white" />
                    </div>
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

      {/* MODAL: Carga Masiva */}
      {isModalBulkOpen && canCrearGuias && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-title text-lg text-brand-dark">Importar Guías (Excel)</h3>
              <button onClick={() => setIsModalBulkOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 font-body text-center">
              <p className="text-sm text-gray-600 mb-4">El archivo debe contener las columnas: <br/><code className="text-xs bg-gray-100 p-1 rounded">empresa_id, nombre_remitente, nombre_destinatario, direccion_destinatario, etc.</code></p>
              <form id="bulkForm" onSubmit={handleBulkUpload}>
                <input type="file" name="archivo" accept=".xlsx,.csv" required className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" />
              </form>
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

      {/* MODAL: Asignar Repartidor */}
      {isModalAsignarOpen && guiaActual && canAsignarGuias && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-title text-lg text-brand-dark">Asignar Repartidor</h3>
              <p className="text-sm text-gray-500 font-body mt-1">Guía: <span className="font-bold">{guiaActual.numero_guia}</span></p>
            </div>
            <form onSubmit={confirmarAsignacion} className="p-5 font-body">
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Seleccione el repartidor:</label>
                <select name="repartidor_id" required className="w-full p-2 border border-gray-300 rounded-lg focus:ring-brand-light focus:border-brand-light">
                  <option value="">Seleccione...</option>
                  {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre_completo}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsModalAsignarOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600">Cancelar</button>
                <button type="submit" disabled={actionLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                  {actionLoading ? 'Asignando...' : 'Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Detalle Guía */}
      {isModalDetalleOpen && guiaActual && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="font-title text-xl text-brand-dark">{guiaActual.numero_guia}</h3>
                <p className="text-sm text-gray-500 font-body mt-1">Empresa: {guiaActual.empresa?.nombre || '-'}</p>
              </div>
              <div className="flex items-center gap-4">
                <BadgeEstado estado={guiaActual.estado_actual} />
                <button onClick={() => setIsModalDetalleOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto font-body flex flex-col md:flex-row gap-6">
              
              {/* Columna Izquierda: Datos */}
              <div className="flex-1 space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Destino</h4>
                  <p className="font-semibold text-gray-800">{guiaActual.nombre_destinatario}</p>
                  <p className="text-sm text-gray-600">{guiaActual.direccion_destinatario}</p>
                  {guiaActual.barrio && <p className="text-sm text-gray-600">Barrio: {guiaActual.barrio}</p>}
                  <p className="text-sm text-gray-600">{guiaActual.ciudad_destino}</p>
                  <p className="text-sm text-gray-600 mt-2 flex items-center gap-2">
                    <Phone size={14} className="text-brand-primary" /> {guiaActual.telefono_destinatario}
                  </p>

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
                
                {guiaActual.observaciones && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Notas</h4>
                    <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded">{guiaActual.observaciones}</p>
                  </div>
                )}
              </div>

              {/* Columna Derecha: Timeline */}
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
                          {h.nota && <span className="text-xs text-gray-600 mt-1 block">{h.nota}</span>}
                          {h.foto_evidencia_url && (
                            <a href={h.foto_evidencia_url} target="_blank" rel="noreferrer" className="mt-2 block w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity">
                              <img src={h.foto_evidencia_url} alt="Evidencia" className="w-full h-full object-cover" />
                            </a>
                          )}
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
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-3xl">
              <button 
                onClick={() => descargarEtiqueta(guiaActual.id, guiaActual.numero_guia)} 
                disabled={!canDescargarEtiquetas}
                title={!canDescargarEtiquetas ? tooltipSinPermiso : 'Descargar etiqueta'}
                className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-gray-700 bg-white border-2 border-gray-200 hover:border-brand-primary/30 hover:bg-gray-50 rounded-2xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileDown size={16} className="text-brand-primary" /> Descargar Etiqueta
              </button>
              <button 
                onClick={() => setIsModalDetalleOpen(false)} 
                className="px-8 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-gray-900 hover:bg-black rounded-2xl transition-all active:scale-95 shadow-lg shadow-gray-900/20"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: Editar Guía */}
      {isModalEditarOpen && guiaActual && canEditarGuias && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-title text-lg text-gray-900 leading-none">Corregir Guía</h3>
                  <p className="text-xs text-gray-500 font-black tracking-widest mt-1 uppercase leading-none">{guiaActual.numero_guia}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalEditarOpen(false)} 
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={editarGuia} className="p-6 max-h-[70vh] overflow-y-auto font-body space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black uppercase text-gray-500 mb-2 tracking-widest">Información de Destino</label>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Dirección Completa</label>
                      <input 
                        type="text" name="direccion_destinatario" required 
                        defaultValue={guiaActual.direccion_destinatario}
                        className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl focus:border-brand-primary outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Barrio</label>
                        <input 
                          type="text" name="barrio" 
                          defaultValue={guiaActual.barrio}
                          className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl focus:border-brand-primary outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Ciudad</label>
                        <input 
                          type="text" name="ciudad_destino" required 
                          defaultValue={guiaActual.ciudad_destino}
                          className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl focus:border-brand-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-gray-100">
                  <label className="block text-xs font-black uppercase text-gray-500 mb-2 tracking-widest">Gestión Logística</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Estado Operativo</label>
                      <select 
                        name="estado_actual" 
                        defaultValue={guiaActual.estado_actual}
                        className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl focus:border-brand-primary outline-none transition-all bg-white"
                      >
                        <option value="registrado">Registrado (Nuevo)</option>
                        <option value="asignado">Asignado</option>
                        <option value="en_ruta">En Ruta</option>
                        <option value="reagendar">Reagendar</option>
                        <option value="direccion_incorrecta">Dirección Incorrecta</option>
                        <option value="no_contesto">No Contestó</option>
                        <option value="entregado">Entregado</option>
                        <option value="devuelto">Devuelto al Almacén</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Nota de Corrección</label>
                      <input 
                        type="text" name="nota_admin" 
                        placeholder="Ej: Dirección corregida por cliente..."
                        className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl focus:border-brand-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </form>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setIsModalEditarOpen(false)}
                className="px-6 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-800 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={(e) => editarGuia(e)}
                disabled={actionLoading}
                className="px-8 py-3 bg-brand-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-brand-primary/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {actionLoading ? 'Guardando...' : 'Actualizar Guía'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

