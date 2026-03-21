import { useState, useEffect } from 'react';
import { codService, firmaService, gpsService, repartidorService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LayoutMovil from '../../components/LayoutMovil';
import BadgeEstado from '../../components/BadgeEstado';
import FirmaCanvas from '../../components/FirmaCanvas';
import { formatCOP } from '../../utils/formato';
import { 
  RefreshCw, Package, Truck, Phone, 
  ChevronRight, CheckCircle2, XCircle, 
  MapPin, AlertCircle, Info, Camera, CheckSquare, Square
} from 'lucide-react';

export default function RepartidorGuias() {
  const { token } = useAuth();
  
  const [guias, setGuias] = useState([]);
  const [guiasEntregadasHoy, setGuiasEntregadasHoy] = useState([]);
  const [tabActiva, setTabActiva] = useState('activas');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMSG, setErrorMSG] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState(null); // 'detalle', 'estado'
  const [guiaActual, setGuiaActual] = useState(null);

  // Form State
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [nota, setNota] = useState('');
  const [codObservaciones, setCodObservaciones] = useState('');
  const [foto, setFoto] = useState(null);
  const [fotoPreview, setFotoPreview] = useState('');
  const [codMetodo, setCodMetodo] = useState('efectivo');
  const [nombreReceptor, setNombreReceptor] = useState('');
  const [cedulaReceptor, setCedulaReceptor] = useState('');
  const [firmaDataUrl, setFirmaDataUrl] = useState(null);
  const [firmaTieneTrazo, setFirmaTieneTrazo] = useState(false);
  const [selectedAsignadas, setSelectedAsignadas] = useState([]);
  const [bulkEnRutaLoading, setBulkEnRutaLoading] = useState(false);

  const hoy = new Date().toISOString().slice(0, 10);

  const cargarGuias = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    setErrorMSG(null);
    try {
      const [resActivas, resEntregadasHoy] = await Promise.all([
        repartidorService.misGuias(token),
        repartidorService.misGuias(token, { estado: 'entregado', fecha: hoy }),
      ]);
      setGuias(resActivas || []);
      setGuiasEntregadasHoy(resEntregadasHoy || []);
    } catch (err) {
      setErrorMSG(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    cargarGuias();
    const interval = setInterval(() => cargarGuias(true), 120000); // refresh every 2 min
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const asignadasIds = new Set(guias.filter((g) => g.estado_actual === 'asignado').map((g) => g.id));
    setSelectedAsignadas((prev) => prev.filter((id) => asignadasIds.has(id)));
  }, [guias]);

  useEffect(() => {
    if (!token || !navigator.geolocation) return undefined;

    let cancelled = false;
    const enviarUbicacion = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
          try {
            await gpsService.actualizarUbicacion(token, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              precision_m: Math.round(pos.coords.accuracy),
            });
          } catch (_err) {
            // El GPS es opt-in y no debe bloquear la experiencia.
          }
        },
        () => {
          // Si el usuario niega el permiso, se ignora silenciosamente.
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };

    enviarUbicacion();
    const interval = setInterval(enviarUbicacion, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      gpsService.desactivarUbicacion(token).catch(() => {});
    };
  }, [token]);

  // -- SUMMARY MAP --
  const resumen = { enRuta: 0, asignadas: 0, otras: 0 };
  guias.forEach(g => {
    if (g.estado_actual === 'en_ruta') resumen.enRuta++;
    else if (g.estado_actual === 'asignado') resumen.asignadas++;
    else resumen.otras++;
  });

  // -- ACTIONS --
  const openDetalle = (guia) => {
    setGuiaActual(guia);
    setModalMode('detalle');
    setModalOpen(true);
  };

  const openEstado = (guia) => {
    setGuiaActual(guia);
    setNuevoEstado('');
    setNota('');
    setFoto(null);
    setFotoPreview('');
    setFormError('');
    setCodMetodo('efectivo');
    setCodObservaciones('');
    setNombreReceptor('');
    setCedulaReceptor('');
    setFirmaDataUrl(null);
    setFirmaTieneTrazo(false);
    setModalMode('estado');
    setModalOpen(true);
  };

  const dataURLToBlob = (dataURL) => {
    if (!dataURL) return null;
    const [meta, base64] = dataURL.split(',');
    const mime = meta?.match(/:(.*?);/)?.[1] || 'image/png';
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const handleFoto = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFoto(file);
      setFotoPreview(URL.createObjectURL(file));
    }
  };

  const guiasAsignadas = guias.filter((g) => g.estado_actual === 'asignado');
  const guiasVisibles = tabActiva === 'entregadas' ? guiasEntregadasHoy : guias;

  const formatearHoraEntrega = (fechaIso) => {
    if (!fechaIso) return 'Hora no disponible';
    const fecha = new Date(fechaIso);
    if (Number.isNaN(fecha.getTime())) return 'Hora no disponible';
    return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  const toggleSelectAsignada = (guiaId) => {
    setSelectedAsignadas((prev) => (
      prev.includes(guiaId)
        ? prev.filter((id) => id !== guiaId)
        : [...prev, guiaId]
    ));
  };

  const toggleSelectAllAsignadas = () => {
    if (guiasAsignadas.length === 0) return;
    if (selectedAsignadas.length === guiasAsignadas.length) {
      setSelectedAsignadas([]);
      return;
    }
    setSelectedAsignadas(guiasAsignadas.map((g) => g.id));
  };

  const iniciarRutaMasiva = async () => {
    if (selectedAsignadas.length === 0) return;
    setBulkEnRutaLoading(true);
    setFormError('');
    try {
      const settled = await Promise.allSettled(
        selectedAsignadas.map((id) => repartidorService.cambiarEstado(token, id, { estado: 'en_ruta', nota: '' }))
      );
      const ok = settled.filter((r) => r.status === 'fulfilled').length;
      const fail = settled.length - ok;
      if (fail > 0) {
        setFormError(`Se iniciaron ${ok} guía(s) y ${fail} no se pudieron actualizar.`);
      }
      setSelectedAsignadas([]);
      await cargarGuias(true);
    } catch (err) {
      setFormError(err.message || 'No se pudieron iniciar las guías seleccionadas');
    } finally {
      setBulkEnRutaLoading(false);
    }
  };

  const handleEstadoSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if ((nuevoEstado === 'entregado' || nuevoEstado === 'no_contesto') && !nota.trim()) {
      setFormError('La nota es obligatoria para este estado');
      return;
    }

    if (nuevoEstado === 'entregado' && !foto) {
      setFormError('La foto de evidencia es obligatoria para confirmar la entrega');
      return;
    }

    if (nuevoEstado === 'entregado' && guiaActual.es_cod) {
      if (!guiaActual.monto_cod || Number(guiaActual.monto_cod) <= 0) {
        setFormError('La guía COD no tiene un monto válido configurado');
        return;
      }
      if (!codMetodo) {
        setFormError('Selecciona un metodo de pago de contraentrega');
        return;
      }
    }

    setFormLoading(true);
    try {
      let foto_evidencia_url = null;
      let firma_url = null;
      if (foto && nuevoEstado === 'entregado') {
        const resFoto = await repartidorService.subirEvidencia(token, guiaActual.id, foto);
        foto_evidencia_url = resFoto.foto_url;
      }

      if (nuevoEstado === 'entregado' && firmaTieneTrazo && firmaDataUrl) {
        const blob = dataURLToBlob(firmaDataUrl);
        const uploaded = await firmaService.subir(token, guiaActual.id, blob);
        firma_url = uploaded?.firma_url || null;
      }

      const notaBase = nota.trim();
      const observacionPago = codObservaciones.trim();
      const notaFinal = (nuevoEstado === 'entregado' && guiaActual.es_cod && observacionPago)
        ? `${notaBase}${notaBase ? ' | ' : ''}Obs pago COD: ${observacionPago}`
        : notaBase;

      await repartidorService.cambiarEstado(token, guiaActual.id, {
        estado: nuevoEstado,
        nota: notaFinal,
        foto_evidencia_url,
        firma_url,
        nombre_receptor: nombreReceptor.trim() || null,
        cedula_receptor: cedulaReceptor.trim() || null,
      });

      if (nuevoEstado === 'entregado' && guiaActual.es_cod) {
        await codService.registrarCobro(token, guiaActual.id, {
          cod_cobrado: Number(guiaActual.monto_cod),
          cod_metodo: codMetodo,
        });
      }

      setModalOpen(false);
      cargarGuias(true); // silent refresh
    } catch (err) {
      setFormError(err.message || 'Error al actualizar estado');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <LayoutMovil title="Mis Entregas">
      
      {/* Resumen Operativo */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-1">
            <Package size={16} />
          </div>
          <div className="text-lg font-title text-gray-800">{guias.length}</div>
          <div className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter text-center">Total</div>
        </div>
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 mb-1">
            <Truck size={16} />
          </div>
          <div className="text-lg font-title text-orange-600 uppercase">{resumen.enRuta}</div>
          <div className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter text-center">En Ruta</div>
        </div>
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center relative">
          <button 
            onClick={() => cargarGuias(true)} 
            disabled={refreshing || loading} 
            className={`w-10 h-10 rounded-full bg-brand-navy text-white flex items-center justify-center shadow-md active:scale-95 transition-transform ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={18} />
          </button>
          <div className="text-[10px] text-gray-400 uppercase font-bold mt-1">Actualizar</div>
        </div>
      </div>

      <div className="mb-4 bg-white rounded-2xl border border-gray-100 p-1 grid grid-cols-2 gap-1 shadow-sm">
        <button
          onClick={() => setTabActiva('activas')}
          className={`h-10 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${tabActiva === 'activas' ? 'bg-brand-navy text-white' : 'text-gray-600'}`}
        >
          Activas ({guias.length})
        </button>
        <button
          onClick={() => setTabActiva('entregadas')}
          className={`h-10 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${tabActiva === 'entregadas' ? 'bg-emerald-600 text-white' : 'text-gray-600'}`}
        >
          Entregadas hoy ({guiasEntregadasHoy.length})
        </button>
      </div>

      {tabActiva === 'activas' && guiasAsignadas.length > 0 && (
        <div className="mb-4 bg-white border border-blue-100 rounded-2xl p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-black uppercase tracking-widest text-blue-700">Inicio masivo de ruta</p>
            <button
              onClick={toggleSelectAllAsignadas}
              className="text-xs font-bold text-blue-700 inline-flex items-center gap-1"
            >
              {selectedAsignadas.length === guiasAsignadas.length && guiasAsignadas.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
              {selectedAsignadas.length === guiasAsignadas.length && guiasAsignadas.length > 0 ? 'Quitar todas' : 'Seleccionar todas'}
            </button>
          </div>
          <p className="text-xs text-gray-600 mb-3">Seleccionadas: <strong>{selectedAsignadas.length}</strong> de {guiasAsignadas.length} asignadas.</p>
          <button
            onClick={iniciarRutaMasiva}
            disabled={bulkEnRutaLoading || selectedAsignadas.length === 0}
            className="w-full min-h-[46px] rounded-xl bg-orange-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60"
          >
            {bulkEnRutaLoading ? 'Iniciando ruta...' : `Iniciar ruta (${selectedAsignadas.length})`}
          </button>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-4 pb-24">
        {loading && !refreshing && <div className="text-center p-8 text-gray-400 text-sm">Cargando guías...</div>}
        {errorMSG && <div className="text-center p-4 text-red-500 text-sm bg-red-50 rounded-lg">{errorMSG}</div>}
        
        {!loading && guiasVisibles.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="text-green-500" size={32} />
            </div>
            <h3 className="text-gray-800 font-title text-lg mb-1">{tabActiva === 'entregadas' ? 'Sin entregas hoy' : '¡Misión Cumplida!'}</h3>
            <p className="text-gray-500 text-sm px-6">{tabActiva === 'entregadas' ? 'Aún no tienes guías marcadas como entregadas en la fecha de hoy.' : 'Has completado todas tus entregas asignadas por hoy.'}</p>
          </div>
        )}

        {guiasVisibles.map(g => (
          <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative group">
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
              g.estado_actual === 'en_ruta' ? 'bg-orange-400' :
              g.estado_actual === 'asignado' ? 'bg-blue-400' : 
              g.estado_actual === 'no_contesto' ? 'bg-red-400' : 'bg-gray-300'
            }`}></div>

            {tabActiva === 'entregadas' && (
              <div className="mx-4 mt-4 ml-6 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-widest font-black text-emerald-700">Hora de entrega</p>
                <p className="text-2xl font-title text-emerald-800 leading-none mt-1">{formatearHoraEntrega(g.ultimo_estado?.created_at)}</p>
              </div>
            )}
            
            <div className="p-4 pl-6">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-1.5">
                  {g.estado_actual === 'asignado' && (
                    <button
                      onClick={() => toggleSelectAsignada(g.id)}
                      className={`h-7 w-7 rounded-md border inline-flex items-center justify-center transition-colors ${selectedAsignadas.includes(g.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}
                      aria-label={selectedAsignadas.includes(g.id) ? 'Quitar de seleccion' : 'Seleccionar guia'}
                    >
                      {selectedAsignadas.includes(g.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                  )}
                  <Package size={14} className="text-gray-400" />
                  <span className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">{g.numero_guia}</span>
                </div>
                <BadgeEstado estado={g.estado_actual} />
              </div>

              {g.es_cod && (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                  <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Contraentrega</p>
                  <p className="text-lg font-title text-emerald-900 leading-none mt-1">{formatCOP(g.cod_cobrado || g.monto_cod || 0)}</p>
                  <p className="text-[11px] text-emerald-700 mt-1">{g.cod_estado === 'cobrado' ? 'Cobrada' : 'Pendiente por cobrar'}</p>
                </div>
              )}
              
              <div className="mb-4">
                <h3 className="text-lg font-title text-gray-900 leading-tight mb-2">{g.nombre_destinatario}</h3>
                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin size={16} className="mt-0.5 flex-shrink-0 text-brand-primary" />
                  <div>
                    <p className="text-sm font-medium leading-snug">{g.direccion_destinatario}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide font-semibold">{g.barrio ? `${g.barrio}, ` : ''}{g.ciudad_destino}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 mb-3">
                {g.telefono_destinatario && (
                  <a href={`tel:${g.telefono_destinatario}`} className="flex-1 h-12 flex items-center justify-center bg-green-50 text-green-700 rounded-xl text-sm font-bold border border-green-100 active:bg-green-100 transition-colors gap-2">
                    <Phone size={16} /> Llamar
                  </a>
                )}
                <button onClick={() => openDetalle(g)} className="flex-1 h-12 flex items-center justify-center text-gray-600 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold active:bg-gray-100 transition-colors gap-2">
                  <Info size={16} /> Detalles
                </button>
              </div>
              
              {tabActiva === 'activas' ? (
                <button onClick={() => openEstado(g)} className="w-full h-12 flex items-center justify-center bg-brand-navy text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-navy/20 active:scale-[0.98] transition-all gap-2">
                  Gestionar Entrega <ChevronRight size={18} />
                </button>
              ) : (
                <div className="w-full h-12 flex items-center justify-center bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-100">
                  Entregada hoy
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* OVERLAYS */}
      {modalOpen && guiaActual && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
            
            {/* Header Modal */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-light/20 text-brand-primary rounded-xl flex items-center justify-center">
                   {modalMode === 'detalle' ? <Info size={20} /> : <RefreshCw size={20} />}
                </div>
                <div>
                  <h3 className="font-title text-base font-bold text-gray-900 leading-none">
                    {modalMode === 'detalle' ? 'Detalle de Entrega' : 'Actualizar Estado'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-black tracking-widest mt-1 uppercase leading-none">{guiaActual.numero_guia}</p>
                </div>
              </div>
              <button 
                onClick={() => setModalOpen(false)} 
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-400 hover:text-gray-900 transition-all active:scale-95"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Content Detalle */}
            {modalMode === 'detalle' && (
              <div className="p-5 overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cliente</h4>
                    <p className="font-bold text-gray-800 text-base">{guiaActual.nombre_destinatario}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{guiaActual.direccion_destinatario}</p>
                    <p className="text-sm text-gray-600">{guiaActual.barrio ? `${guiaActual.barrio}, ` : ''}{guiaActual.ciudad_destino}</p>
                    {guiaActual.telefono_destinatario && (
                      <a href={`tel:${guiaActual.telefono_destinatario}`} className="text-sm font-bold text-green-600 mt-3 flex items-center gap-2 bg-green-50 p-2 rounded-lg border border-green-100 w-fit">
                        <Phone size={14} /> {guiaActual.telefono_destinatario}
                      </a>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-gray-100">
                     <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Paquete</h4>
                     <p className="text-sm text-gray-800">{guiaActual.descripcion_paquete || 'Sin descripción'}</p>
                     {guiaActual.peso_kg && <p className="text-sm text-gray-600 mt-1">Peso: {guiaActual.peso_kg} kg</p>}
                  </div>

                  {guiaActual.es_cod && (
                    <div className="pt-4 border-t border-gray-100">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Contraentrega</h4>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Monto a cobrar</p>
                        <p className="text-2xl font-title text-emerald-900 mt-1">{formatCOP(guiaActual.cod_cobrado || guiaActual.monto_cod || 0)}</p>
                        <p className="text-xs text-emerald-700 mt-1">Estado COD: {guiaActual.cod_estado || 'pendiente'}</p>
                      </div>
                    </div>
                  )}

                  {guiaActual.ultimo_estado && (
                    <div className="pt-4 border-t border-gray-100">
                       <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Último evento</h4>
                       <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                         <BadgeEstado estado={guiaActual.ultimo_estado.estado} />
                         <p className="text-xs text-gray-500 mt-2">{new Date(guiaActual.ultimo_estado.created_at).toLocaleString('es-CO')}</p>
                         {guiaActual.ultimo_estado.nota && <p className="text-sm text-gray-700 font-medium italic mt-1">"{guiaActual.ultimo_estado.nota}"</p>}

                         {(guiaActual.ultimo_estado.nombre_receptor || guiaActual.ultimo_estado.cedula_receptor) && (
                           <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                             <p className="text-[10px] uppercase tracking-widest font-black text-blue-700">Datos del receptor</p>
                             {guiaActual.ultimo_estado.nombre_receptor && (
                               <p className="text-sm text-gray-700 mt-1"><strong>Nombre:</strong> {guiaActual.ultimo_estado.nombre_receptor}</p>
                             )}
                             {guiaActual.ultimo_estado.cedula_receptor && (
                               <p className="text-sm text-gray-700"><strong>Cédula:</strong> {guiaActual.ultimo_estado.cedula_receptor}</p>
                             )}
                           </div>
                         )}

                         {guiaActual.ultimo_estado.foto_evidencia_url && (
                           <div className="mt-3">
                             <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-1">Foto de evidencia</p>
                             <a href={guiaActual.ultimo_estado.foto_evidencia_url} target="_blank" rel="noreferrer">
                               <img
                                 src={guiaActual.ultimo_estado.foto_evidencia_url}
                                 alt="Evidencia de entrega"
                                 className="w-full rounded-xl border border-gray-200 object-cover max-h-52"
                               />
                             </a>
                           </div>
                         )}

                         {guiaActual.ultimo_estado.firma_url && (
                           <div className="mt-3">
                             <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-1">Firma del receptor</p>
                             <a href={guiaActual.ultimo_estado.firma_url} target="_blank" rel="noreferrer">
                               <img
                                 src={guiaActual.ultimo_estado.firma_url}
                                 alt="Firma del receptor"
                                 className="w-full rounded-xl border border-gray-200 bg-white object-contain max-h-44"
                               />
                             </a>
                           </div>
                         )}
                       </div>
                    </div>
                  )}
                </div>

                <div className="mt-8">
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(guiaActual.direccion_destinatario + ', ' + guiaActual.ciudad_destino)}`} target="_blank" rel="noreferrer" className="w-full min-h-[52px] flex items-center justify-center bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest active:bg-black transition-all shadow-lg shadow-gray-900/20 gap-2">
                    <MapPin size={18} /> Navegar en Google Maps
                  </a>
                </div>
              </div>
            )}

            {/* Content Estado */}
            {modalMode === 'estado' && (
              <div className="p-5 overflow-y-auto">
                <form onSubmit={handleEstadoSubmit} className="space-y-5">
                  {formError && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">{formError}</div>}
                  
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">¿Qué sucedió?</label>
                    <div className="grid grid-cols-1 gap-2">
                        {guiaActual.estado_actual === 'asignado' && (
                           <label className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${nuevoEstado === 'en_ruta' ? 'border-orange-400 bg-orange-50' : 'border-gray-100 bg-white'}`}>
                             <input type="radio" value="en_ruta" checked={nuevoEstado === 'en_ruta'} onChange={e => setNuevoEstado(e.target.value)} className="hidden" />
                             <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${nuevoEstado === 'en_ruta' ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-400'}`}>
                               <Truck size={20} />
                             </div>
                             <span className="font-bold text-gray-800">Iniciar Ruta</span>
                           </label>
                        )}
                        
                        {(guiaActual.estado_actual === 'en_ruta' || guiaActual.estado_actual === 'no_contesto' || guiaActual.estado_actual === 'reagendar') && (
                           <div className="grid grid-cols-1 gap-3">
                             <label className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${nuevoEstado === 'entregado' ? 'border-green-500 bg-green-50' : 'border-gray-100 bg-white'}`}>
                               <input type="radio" value="entregado" checked={nuevoEstado === 'entregado'} onChange={e => setNuevoEstado(e.target.value)} className="hidden" />
                               <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${nuevoEstado === 'entregado' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                 <CheckCircle2 size={20} />
                               </div>
                               <span className="font-bold text-gray-800">Entregado</span>
                             </label>

                             <label className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${nuevoEstado === 'no_contesto' ? 'border-amber-500 bg-amber-50' : 'border-gray-100 bg-white'}`}>
                               <input type="radio" value="no_contesto" checked={nuevoEstado === 'no_contesto'} onChange={e => setNuevoEstado(e.target.value)} className="hidden" />
                               <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${nuevoEstado === 'no_contesto' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                 <AlertCircle size={20} />
                               </div>
                               <span className="font-bold text-gray-800">No Contestó</span>
                             </label>

                             <label className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${nuevoEstado === 'direccion_incorrecta' ? 'border-red-500 bg-red-50' : 'border-gray-100 bg-white'}`}>
                               <input type="radio" value="direccion_incorrecta" checked={nuevoEstado === 'direccion_incorrecta'} onChange={e => setNuevoEstado(e.target.value)} className="hidden" />
                               <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${nuevoEstado === 'direccion_incorrecta' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                 <MapPin size={20} />
                               </div>
                               <span className="font-bold text-gray-800">Dirección Incorrecta</span>
                             </label>

                             <label className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${nuevoEstado === 'reagendar' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'}`}>
                               <input type="radio" value="reagendar" checked={nuevoEstado === 'reagendar'} onChange={e => setNuevoEstado(e.target.value)} className="hidden" />
                               <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${nuevoEstado === 'reagendar' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                 <AlertCircle size={20} />
                               </div>
                               <span className="font-bold text-gray-800">Reagendar</span>
                             </label>
                           </div>
                        )}
                    </div>
                  </div>

                  {nuevoEstado && nuevoEstado !== 'en_ruta' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Nota / Novedad {(nuevoEstado === 'entregado' || nuevoEstado === 'no_contesto') && <span className="text-red-500">*</span>}</label>
                      <textarea
                        value={nota} onChange={e => setNota(e.target.value)}
                        placeholder="Ej: Entregado a conserje, o familiar..."
                        rows={2}
                        className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-brand-light outline-none transition-all"
                      />
                    </div>
                  )}

                  {nuevoEstado === 'entregado' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Foto de Evidencia <span className="text-red-500">*</span></label>
                      {fotoPreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-gray-200 aspect-video bg-gray-100">
                          <img src={fotoPreview} alt="Evidencia" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => { setFoto(null); setFotoPreview(''); }} className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full text-sm">✕</button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input type="file" accept="image/*" capture="environment" onChange={handleFoto} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center justify-center text-gray-400 bg-gray-50 active:bg-gray-100 transition-colors">
                            <Camera size={40} strokeWidth={1.5} className="mb-2" />
                            <span className="text-xs font-bold uppercase tracking-wider">Tomar Evidencia</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {nuevoEstado === 'entregado' && (
                    <div className="space-y-3 border border-blue-100 bg-blue-50 rounded-2xl p-4">
                      <p className="text-sm font-bold text-blue-900">Datos del receptor (recomendado)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Nombre receptor</label>
                          <input
                            type="text"
                            value={nombreReceptor}
                            onChange={(e) => setNombreReceptor(e.target.value)}
                            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Cédula receptor</label>
                          <input
                            type="text"
                            value={cedulaReceptor}
                            onChange={(e) => setCedulaReceptor(e.target.value)}
                            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Firma digital</label>
                        <FirmaCanvas onFirma={(dataURL, hasStroke) => { setFirmaDataUrl(dataURL); setFirmaTieneTrazo(Boolean(hasStroke)); }} />
                      </div>
                    </div>
                  )}

                  {nuevoEstado === 'entregado' && guiaActual.es_cod && (
                    <div className="space-y-3 border border-emerald-100 bg-emerald-50 rounded-2xl p-4">
                      <div>
                        <p className="text-sm font-bold text-emerald-800">Esta guia requiere cobro contraentrega</p>
                        <p className="text-xs text-emerald-700 uppercase tracking-widest mt-2">Monto a cobrar</p>
                        <p className="text-3xl font-title text-emerald-900 leading-none mt-1">{formatCOP(guiaActual.monto_cod)}</p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Metodo de pago</label>
                        <select
                          value={codMetodo}
                          onChange={(e) => setCodMetodo(e.target.value)}
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
                        >
                          <option value="efectivo">Efectivo</option>
                          <option value="nequi">Nequi</option>
                          <option value="daviplata">Daviplata</option>
                          <option value="transferencia">Transferencia</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Observaciones del pago (opcional)</label>
                        <textarea
                          value={codObservaciones}
                          onChange={(e) => setCodObservaciones(e.target.value)}
                          rows={2}
                          placeholder="Ej: pagó mitad en efectivo y mitad por Nequi"
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <button type="submit" disabled={formLoading || !nuevoEstado} className="w-full min-h-[52px] flex items-center justify-center bg-brand-primary text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20 disabled:opacity-50 disabled:bg-gray-300 transition-all active:scale-[0.98]">
                      {formLoading ? 'Guardando...' : 'Confirmar Estado'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

    </LayoutMovil>
  );
}
