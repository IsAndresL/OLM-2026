import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
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
  Printer,
  RefreshCw
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
import { formatCOP } from '../../utils/formato';

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

const columnasObligatoriasBulk = [
  'nombre_remitente',
  'nombre_destinatario',
  'telefono_destinatario',
  'direccion_destinatario',
  'ciudad_destino',
];

const columnasOpcionalesBulk = [
  'empresa_id',
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
  empresa_id: 'UUID de la empresa (solo admin).',
  barrio: 'Barrio para mejorar zona y ruta.',
  descripcion_paquete: 'Que contiene el envio.',
  peso_kg: 'Peso del paquete en kilogramos.',
  valor_declarado: 'Valor comercial declarado del paquete.',
  zona_id: 'UUID de zona (si ya lo tienes).',
  lat: 'Latitud del punto de entrega.',
  lng: 'Longitud del punto de entrega.',
};

const COD_METODO_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
};



export default function AdminGuias() {
  const { token, user, hasPermission } = useAuth();
  const { alerta, mostrarAlerta, cerrarAlerta } = useAlerta();
  const canCrearGuias = hasPermission('guias.create');
  const canEditarGuias = hasPermission('guias.edit');
  const canAsignarGuias = hasPermission('guias.assign');
  const canEliminarGuias = hasPermission('guias.delete');
  const canDescargarEtiquetas = hasPermission('etiquetas.generar');
  const canExportarReportes = hasPermission('reportes.export');
  const canSeleccionMasiva = canDescargarEtiquetas || canEliminarGuias || canAsignarGuias;
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
  const [isModalAsignarMasivoOpen, setIsModalAsignarMasivoOpen] = useState(false);
  const [guiaActual, setGuiaActual] = useState(null);

  
  // Loading states
  const [actionLoading, setActionLoading] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);
  const [zonaDetectadaCrear, setZonaDetectadaCrear] = useState(null);
  const [bulkEmpresaId, setBulkEmpresaId] = useState('');
  const [bulkErrores, setBulkErrores] = useState([]);
  const [undoAsignacion, setUndoAsignacion] = useState(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoRemainingMs, setUndoRemainingMs] = useState(0);
  const undoRafRef = useRef(null);
  const undoCloseTimeoutRef = useRef(null);

  const UNDO_MS = 8000;

  const limpiarTemporizadoresUndo = () => {
    if (undoRafRef.current) {
      cancelAnimationFrame(undoRafRef.current);
      undoRafRef.current = null;
    }
    if (undoCloseTimeoutRef.current) {
      clearTimeout(undoCloseTimeoutRef.current);
      undoCloseTimeoutRef.current = null;
    }
  };

  const cerrarUndoConAnimacion = () => {
    limpiarTemporizadoresUndo();
    setUndoVisible(false);
    undoCloseTimeoutRef.current = setTimeout(() => {
      setUndoAsignacion(null);
      setUndoRemainingMs(0);
      undoCloseTimeoutRef.current = null;
    }, 260);
  };

  useEffect(() => {
    if (!undoAsignacion) return;
    const startedAt = performance.now();

    const tick = (now) => {
      const elapsed = now - startedAt;
      const remaining = Math.max(0, UNDO_MS - elapsed);
      setUndoRemainingMs(remaining);
      if (remaining <= 0) {
        cerrarUndoConAnimacion();
        return;
      }
      undoRafRef.current = requestAnimationFrame(tick);
    };

    limpiarTemporizadoresUndo();
    setUndoVisible(true);
    setUndoRemainingMs(UNDO_MS);
    undoRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (undoRafRef.current) {
        cancelAnimationFrame(undoRafRef.current);
        undoRafRef.current = null;
      }
    };
  }, [undoAsignacion?.id]);

  useEffect(() => {
    return () => {
      limpiarTemporizadoresUndo();
    };
  }, []);

  const programarUndoAsignacion = (cambios, descripcion) => {
    if (!Array.isArray(cambios) || cambios.length === 0) return;
    limpiarTemporizadoresUndo();
    setUndoAsignacion({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cambios,
      descripcion,
    });
  };

  const deshacerAsignacion = async () => {
    if (!undoAsignacion?.cambios?.length) return;
    setUndoLoading(true);
    try {
      const res = await guiasService.deshacerAsignacionBulk(token, undoAsignacion.cambios);
      mostrarAlerta('success', `Asignacion deshecha: ${res.restauradas} guía(s) restauradas`);
      cerrarUndoConAnimacion();
      setSelectedIds([]);
      cargarGuias();
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setUndoLoading(false);
    }
  };

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
      mostrarAlerta('error', err.message);
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
    setFiltros({ page: 1, limit: 50, q: '', estado: '', empresa_id: '', fecha_desde: '', fecha_hasta: '' });
  };

  const recargarGuias = () => {
    cargarGuias();
  };

  // ── ACCIONES INDIVIDUALES ──
  const verDetalle = async (id) => {
    try {
      const g = await guiasService.obtener(token, id);
      setGuiaActual(g);
      setIsModalDetalleOpen(true);
    } catch (err) {
      mostrarAlerta('error', err.message);
    }
  };

  const descargarEtiqueta = async (id, numero) => {
    if (!canDescargarEtiquetas) {
      mostrarAlerta('warning', 'No tienes permiso para generar etiquetas');
      return;
    }

    try {
      const blob = await etiquetasService.descargar(token, id);
      descargarArchivo(blob, `${numero}.pdf`);
    } catch (err) {
      mostrarAlerta('error', err.message);
    }
  };

  const eliminarGuia = async (id) => {
    if (!canEliminarGuias) {
      mostrarAlerta('warning', 'No tienes permiso para eliminar guias');
      return;
    }

    mostrarAlerta('warning', 'Esta accion eliminara la guia de forma permanente.', {
      accionTexto: 'Confirmar',
      durationMs: 7000,
      onAccion: async () => {
        try {
          await guiasService.eliminar(token, id);
          mostrarAlerta('success', 'Guia eliminada correctamente.');
          cargarGuias();
        } catch (err) {
          mostrarAlerta('error', err.message);
        }
      },
    });
  };

  const abrirAsignar = (guia) => {
    if (!canAsignarGuias) {
      mostrarAlerta('warning', 'No tienes permiso para asignar guias');
      return;
    }

    setGuiaActual(guia);
    setIsModalAsignarOpen(true);
  };

  const abrirEditar = (guia) => {
    if (!canEditarGuias) {
      mostrarAlerta('warning', 'No tienes permiso para editar guias');
      return;
    }

    setGuiaActual(guia);
    setIsModalEditarOpen(true);
  };

  const confirmarAsignacion = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    const repId = e.target.repartidor_id.value;
    const snapshot = [{
      id: guiaActual.id,
      estado_actual: guiaActual.estado_actual,
      repartidor_id: guiaActual.repartidor_id || null,
    }];
    try {
      await guiasService.asignar(token, guiaActual.id, repId);
      setIsModalAsignarOpen(false);
      programarUndoAsignacion(snapshot, `Asignaste 1 guía. ¿Deseas deshacer esta acción?`);
      cargarGuias();
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const abrirAsignacionMasiva = () => {
    if (!canAsignarGuias) {
      mostrarAlerta('warning', 'No tienes permiso para asignar guias');
      return;
    }
    if (selectedIds.length === 0) return;
    setIsModalAsignarMasivoOpen(true);
  };

  const confirmarAsignacionMasiva = async (e) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;

    const repId = e.target.repartidor_id.value;
    const snapshot = guias
      .filter((g) => selectedIds.includes(g.id))
      .map((g) => ({
        id: g.id,
        estado_actual: g.estado_actual,
        repartidor_id: g.repartidor_id || null,
      }));
    setActionLoading(true);
    try {
      const res = await guiasService.asignarBulk(token, selectedIds, repId);
      mostrarAlerta(
        'success',
        `Asignadas: ${res.asignadas}. Omitidas por estado: ${res.omitidas_por_estado}. No encontradas: ${res.no_encontradas}.`
      );
      const idsAsignadas = new Set(res.ids_asignadas || []);
      const cambiosUndo = snapshot.filter((s) => idsAsignadas.has(s.id));
      programarUndoAsignacion(cambiosUndo, `Asignaste ${res.asignadas} guía(s). ¿Deseas deshacer esta acción?`);
      setIsModalAsignarMasivoOpen(false);
      setSelectedIds([]);
      cargarGuias();
    } catch (err) {
      mostrarAlerta('error', err.message);
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
      mostrarAlerta('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };


  // ── CREAR GUÍA ──
  const crearGuia = async (e) => {
    e.preventDefault();
    if (!canCrearGuias) {
      mostrarAlerta('warning', 'No tienes permiso para crear guias');
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
      mostrarAlerta('success', 'Guia creada correctamente.');
      cargarGuias();
    } catch (err) {
      mostrarAlerta('error', err.message);
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
      mostrarAlerta('warning', 'No tienes permiso para crear guias');
      return;
    }

    setActionLoading(true);
    const file = e.target.archivo.files[0];
    if (!file) return;
    
    try {
      const payloadEmpresaId = user?.rol === 'admin' ? (bulkEmpresaId || undefined) : undefined;
      const res = await guiasService.bulkUpload(token, file, { empresa_id: payloadEmpresaId });
      setBulkErrores(res.detalle_errores || []);

      mostrarAlerta('success', `Completado: ${res.creadas} guías creadas. ${res.errores} errores.`);
      if (res.errores === 0) {
        setIsModalBulkOpen(false);
        setBulkEmpresaId('');
      }
      cargarGuias();
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const descargarBulk = async () => {
    if (!canDescargarEtiquetas) {
      mostrarAlerta('warning', 'No tienes permiso para generar etiquetas');
      return;
    }

    if (selectedIds.length === 0) return;
    setActionLoading(true);
    try {
      const blob = await etiquetasService.bulk(token, selectedIds);
      descargarArchivo(blob, `etiquetas-${new Date().getTime()}.pdf`);
      setSelectedIds([]);
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const eliminarSeleccionadas = async () => {
    if (!canEliminarGuias) {
      mostrarAlerta('warning', 'No tienes permiso para eliminar guias');
      return;
    }

    if (selectedIds.length === 0) return;
    mostrarAlerta('warning', `Vas a eliminar ${selectedIds.length} guía(s) de forma permanente.`, {
      accionTexto: 'Confirmar',
      durationMs: 7000,
      onAccion: async () => {
        setActionLoading(true);
        try {
          const res = await guiasService.eliminarBulk(token, selectedIds);
          mostrarAlerta('success', `Eliminadas: ${res.eliminadas}. No encontradas: ${res.no_encontradas}.`);
          setSelectedIds([]);
          cargarGuias();
        } catch (err) {
          mostrarAlerta('error', err.message);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const descargarPlantillaBulk = (conEjemplo = false) => {
    const headers = [...columnasObligatoriasBulk, ...columnasOpcionalesBulk];
    const filas = [headers];

    if (conEjemplo) {
      filas.push(
        [
          'Comercial OLM',
          'Juan Perez',
          '3001234567',
          'Calle 10 # 20-30',
          'Santa Marta',
          'UUID_EMPRESA_AQUI',
          'Centro',
          'Caja pequena',
          '1.5',
          '120000',
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

  const descargarErroresBulk = () => {
    if (!bulkErrores.length) return;
    const encabezado = 'fila,motivo';
    const rows = bulkErrores.map((e) => `${e.fila},"${String(e.motivo || '').replace(/"/g, '""')}"`);
    const blob = new Blob([[encabezado, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    descargarArchivo(blob, `errores-carga-guias-${Date.now()}.csv`);
  };

  const toggleSelect = (id) => {
    if (!canSeleccionMasiva) return;
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(x => x !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const toggleSelectAll = () => {
    if (!canSeleccionMasiva) return;
    if (selectedIds.length === guias.length) setSelectedIds([]);
    else setSelectedIds(guias.map(g => g.id));
  };

  const descargarPdfDetalleGuia = async () => {
    if (!guiaActual?.id) return;
    if (!canExportarReportes) {
      mostrarAlerta('warning', 'No tienes permiso para exportar reportes');
      return;
    }

    try {
      const blob = await reportesService.exportarGuiaPdfDetallado(token, guiaActual.id);
      descargarArchivo(blob, `detalle-${guiaActual.numero_guia || 'guia'}.pdf`);
      mostrarAlerta('success', 'PDF detallado generado correctamente');
    } catch (err) {
      mostrarAlerta('error', err.message || 'No se pudo generar el PDF detallado');
    }
  };

  const historialDetalle = (guiaActual?.historial || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const eventoEntrega = historialDetalle.find((h) => h.estado === 'entregado') || null;
  const codMetodoLabel = guiaActual?.cod_metodo ? (COD_METODO_LABELS[guiaActual.cod_metodo] || guiaActual.cod_metodo) : null;

  return (
    <Layout rol="admin">

      <Alerta {...alerta} onClose={cerrarAlerta} />

      {undoAsignacion && (
        <div className="fixed top-4 right-4 z-[120] w-full max-w-sm px-3 sm:px-0 pointer-events-none">
          <div
            className={`w-full bg-white border border-amber-200 shadow-xl rounded-2xl overflow-hidden pointer-events-auto transform transition-all duration-300 ease-out ${undoVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}
          >
            <div className="px-3 py-2.5">
              <p className="text-sm font-semibold text-amber-900">{undoAsignacion.descripcion}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-amber-700">Tiempo restante: {(undoRemainingMs / 1000).toFixed(1)}s</span>
                <button
                  onClick={deshacerAsignacion}
                  disabled={undoLoading}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                >
                  {undoLoading ? 'Deshaciendo...' : 'Deshacer'}
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-amber-100">
              <div
                className="h-full bg-amber-500"
                style={{ width: `${Math.max(0, (undoRemainingMs / UNDO_MS) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-title text-gray-900 mb-2">Gestión de Guías</h1>
          <p className="text-sm text-gray-500 font-body">Control total de envíos, logística y etiquetas dinámicas.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {selectedIds.length > 0 && canAsignarGuias && (
            <button
              onClick={abrirAsignacionMasiva}
              disabled={actionLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
            >
              <UserPlus size={16} /> Asignar ({selectedIds.length})
            </button>
          )}
          {selectedIds.length > 0 && canEliminarGuias && (
            <button
              onClick={eliminarSeleccionadas}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-red-600/20 active:scale-95 disabled:opacity-50"
            >
              <Trash2 size={16} /> {actionLoading ? 'Eliminando...' : `Eliminar (${selectedIds.length})`}
            </button>
          )}
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
            onClick={() => { setBulkErrores([]); setIsModalBulkOpen(true); }} 
            disabled={!canCrearGuias}
            title={!canCrearGuias ? tooltipSinPermiso : 'Importar guias por Excel'}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={16} /> Subir guias en formato Excel
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
            <button
              type="button"
              onClick={recargarGuias}
              disabled={loading}
              className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 border border-blue-200 inline-flex items-center gap-2 disabled:opacity-60"
              title="Recargar estado de guias"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Recargar
            </button>
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
                  <input type="checkbox" disabled={!canSeleccionMasiva} title={!canSeleccionMasiva ? tooltipSinPermiso : 'Seleccionar todas'} onChange={toggleSelectAll} checked={guias.length > 0 && selectedIds.length === guias.length} className="rounded border-gray-300 text-brand-primary focus:ring-brand-light disabled:opacity-40" />
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
                    <input type="checkbox" disabled={!canSeleccionMasiva} title={!canSeleccionMasiva ? tooltipSinPermiso : 'Seleccionar para acciones masivas'} checked={selectedIds.includes(g.id)} onChange={() => toggleSelect(g.id)} className="rounded border-gray-300 text-brand-primary focus:ring-brand-light disabled:opacity-40" />
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Empresa *</label>
                    <select name="empresa_id" required className="w-full p-2 border border-gray-300 rounded-lg">
                      <option value="">Selecciona empresa...</option>
                      {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </div>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-title text-lg text-brand-dark">Subir guias en formato Excel</h3>
              <button onClick={() => { setIsModalBulkOpen(false); setBulkErrores([]); }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 font-body overflow-y-auto">
              {user?.rol === 'admin' && (
                <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                  <h4 className="font-subtitle text-sm font-bold text-indigo-900 mb-2">Empresa destino para toda la carga (opcional)</h4>
                  <p className="text-xs text-indigo-800 mb-3">Si la seleccionas, no necesitas poner <strong>empresa_id</strong> en cada fila. Si no la seleccionas, debes llenar <strong>empresa_id</strong> por fila en el Excel.</p>
                  <select value={bulkEmpresaId} onChange={(e) => setBulkEmpresaId(e.target.value)} className="w-full md:max-w-lg p-2 border border-indigo-200 rounded-lg bg-white text-sm">
                    <option value="">No seleccionar (usare empresa_id por fila)</option>
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.nombre} - {emp.id}</option>
                    ))}
                  </select>
                </div>
              )}

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
                    <p className="text-xs text-amber-900">Si subes como admin y quieres cargar 100 guias para una empresa existente, llena <strong>empresa_id</strong> con el mismo UUID en todas las filas.</p>
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
                      <button type="button" onClick={() => descargarPlantillaBulk(false)} className="px-3 py-2 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Descargar plantilla vacia (XLSX)</button>
                      <button type="button" onClick={() => descargarPlantillaBulk(true)} className="px-3 py-2 text-xs font-bold rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary">Descargar plantilla con ejemplo (XLSX)</button>
                    </div>
                  </div>
                  <form id="bulkForm" onSubmit={handleBulkUpload} className="rounded-xl border border-dashed border-gray-300 p-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-2">Selecciona archivo (.xlsx o .csv)</label>
                    <input type="file" name="archivo" accept=".xlsx,.csv" required className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" />
                  </form>
                </div>
              </div>

              {bulkErrores.length > 0 && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50/70 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="font-subtitle text-sm font-bold text-red-900">Errores detectados en la carga ({bulkErrores.length})</h4>
                    <button type="button" onClick={descargarErroresBulk} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-100 hover:bg-red-200 text-red-700">
                      Descargar errores (CSV)
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto rounded-lg border border-red-100 bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 text-red-700 uppercase">
                        <tr>
                          <th className="p-2 text-left">Fila</th>
                          <th className="p-2 text-left">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {bulkErrores.slice(0, 100).map((err, idx) => (
                          <tr key={`${err.fila}-${idx}`}>
                            <td className="p-2 font-bold text-red-700">{err.fila}</td>
                            <td className="p-2 text-red-900">{err.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button onClick={() => { setIsModalBulkOpen(false); setBulkErrores([]); }} className="px-4 py-2 text-sm font-medium text-gray-600">Cancelar</button>
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

      {/* MODAL: Asignacion Masiva */}
      {isModalAsignarMasivoOpen && canAsignarGuias && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h3 className="font-title text-lg text-brand-dark">Asignar Guías Seleccionadas</h3>
              <p className="text-sm text-gray-500 font-body mt-1">Seleccionadas: <span className="font-bold">{selectedIds.length}</span> guía(s)</p>
              <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">Solo se asignan guías en estado registrado; las demás se omiten.</p>
            </div>
            <form onSubmit={confirmarAsignacionMasiva} className="p-5 font-body">
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Seleccione el repartidor:</label>
                <select name="repartidor_id" required className="w-full p-2 border border-gray-300 rounded-lg focus:ring-brand-light focus:border-brand-light">
                  <option value="">Seleccione...</option>
                  {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre_completo}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsModalAsignarMasivoOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600">Cancelar</button>
                <button type="submit" disabled={actionLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                  {actionLoading ? 'Asignando...' : 'Asignar Seleccionadas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Detalle Guía */}
      {isModalDetalleOpen && guiaActual && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
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
            <div className="p-5 overflow-y-auto font-body grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              <div className="xl:col-span-2 space-y-4">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-100 p-4 bg-white">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Datos de entrega</h4>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Receptor:</span> {eventoEntrega?.nombre_receptor || '-'}</p>
                    <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Documento:</span> {eventoEntrega?.cedula_receptor || '-'}</p>
                    <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Novedad:</span> {eventoEntrega?.nota || '-'}</p>
                    <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Fecha entrega:</span> {eventoEntrega?.created_at ? new Date(eventoEntrega.created_at).toLocaleString('es-CO') : '-'}</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 p-4 bg-white">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Contraentrega (COD)</h4>
                    {!guiaActual.es_cod ? (
                      <p className="text-sm text-gray-600">Esta guía no tiene contraentrega.</p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-700"><span className="font-semibold">Monto a cobrar:</span> {formatCOP(guiaActual.monto_cod || 0)}</p>
                        <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Monto cobrado:</span> {formatCOP(guiaActual.cod_cobrado || 0)}</p>
                        <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Metodo de cobro:</span> {codMetodoLabel || '-'}</p>
                        <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Estado COD:</span> {guiaActual.cod_estado || '-'}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-100 p-4 bg-white">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Foto evidencia</h4>
                    {eventoEntrega?.foto_evidencia_url ? (
                      <a href={eventoEntrega.foto_evidencia_url} target="_blank" rel="noreferrer" className="block w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity">
                        <img src={eventoEntrega.foto_evidencia_url} alt="Evidencia de entrega" className="w-full h-full object-cover" />
                      </a>
                    ) : (
                      <p className="text-sm text-gray-500">Sin evidencia cargada.</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-100 p-4 bg-white">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Firma de recibido</h4>
                    {eventoEntrega?.firma_url ? (
                      <a href={eventoEntrega.firma_url} target="_blank" rel="noreferrer" className="block w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity">
                        <img src={eventoEntrega.firma_url} alt="Firma de recibido" className="w-full h-full object-contain bg-white" />
                      </a>
                    ) : (
                      <p className="text-sm text-gray-500">Sin firma registrada.</p>
                    )}
                  </div>
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

              <div className="xl:col-span-1 rounded-lg border border-gray-100 p-4 bg-gray-50">
                <h4 className="text-xs font-bold text-brand-primary uppercase mb-4">Historial de estados</h4>
                <div className="space-y-3">
                  {historialDetalle.map((h) => (
                    <div key={h.id} className="bg-white border border-gray-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <BadgeEstado estado={h.estado} />
                        <span className="text-[11px] text-gray-500">{new Date(h.created_at).toLocaleString('es-CO')}</span>
                      </div>

                      {h.nota && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-900">
                          {h.nota}
                        </div>
                      )}

                      {(h.nombre_receptor || h.cedula_receptor) && (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
                          {h.nombre_receptor && <p><span className="font-semibold">Receptor:</span> {h.nombre_receptor}</p>}
                          {h.cedula_receptor && <p><span className="font-semibold">Doc:</span> {h.cedula_receptor}</p>}
                        </div>
                      )}

                      {(h.foto_evidencia_url || h.firma_url) && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {h.foto_evidencia_url ? (
                            <a href={h.foto_evidencia_url} target="_blank" rel="noreferrer" className="block aspect-video rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                              <img src={h.foto_evidencia_url} alt="Evidencia" className="w-full h-full object-cover" />
                            </a>
                          ) : <div className="aspect-video rounded-lg border border-dashed border-gray-200 bg-gray-50" />}

                          {h.firma_url ? (
                            <a href={h.firma_url} target="_blank" rel="noreferrer" className="block aspect-video rounded-lg overflow-hidden border border-gray-200 bg-white">
                              <img src={h.firma_url} alt="Firma" className="w-full h-full object-contain" />
                            </a>
                          ) : <div className="aspect-video rounded-lg border border-dashed border-gray-200 bg-gray-50" />}
                        </div>
                      )}
                    </div>
                  ))}
                  {historialDetalle.length === 0 && <p className="text-xs text-gray-400 italic">No hay historial</p>}
                </div>
              </div>
              
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-3xl">
              <button
                onClick={descargarPdfDetalleGuia}
                disabled={!canExportarReportes}
                title={!canExportarReportes ? tooltipSinPermiso : 'Descargar PDF detallado'}
                className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-brand-primary hover:bg-brand-light rounded-2xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-brand-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText size={16} /> PDF Detallado
              </button>
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
            
            <form id="form-editar-guia" onSubmit={editarGuia} className="p-6 max-h-[70vh] overflow-y-auto font-body space-y-6">
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
                type="submit"
                form="form-editar-guia"
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

