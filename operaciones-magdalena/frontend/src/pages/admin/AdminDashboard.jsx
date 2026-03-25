import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  Calendar, 
  FileSpreadsheet, 
  TrendingUp, 
  Package, 
  MapPin, 
  CheckCircle, 
  Zap, 
  PackageSearch,
  ChevronLeft,
  ChevronRight,
  X,
  Users as UsersIcon,
  Building2,
  SlidersHorizontal
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  Bar 
} from 'recharts';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useAlerta from '../../hooks/useAlerta';
import Layout from '../../components/Layout';
import Alerta from '../../components/Alerta';
import { dashboardService, reportesService } from '../../services/api';

function SkeletonCard({ height = "h-32" }) {
  return <div className={`bg-gray-100 animate-pulse rounded-[2rem] ${height} w-full`}></div>;
}



function KPICard({ titulo, valor, subtitulo, alerta, esTasa, icon: IconComponent, colorClass = "text-brand-primary" }) {
  const isRedAlert = alerta && parseInt(valor) > 0;
  return (
    <div className={`bg-white rounded-[2rem] p-6 shadow-sm border transition-all hover:shadow-md group ${isRedAlert ? 'border-red-400 bg-red-50/10' : 'border-gray-100 hover:border-brand-primary/20'}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-xl bg-gray-50 group-hover:bg-brand-light/20 transition-colors ${isRedAlert ? 'bg-red-50 text-red-500' : 'text-gray-400 group-hover:text-brand-primary'}`}>
          {IconComponent && <IconComponent size={20} />}
        </div>
        {isRedAlert && <div className="animate-pulse bg-red-500 w-2 h-2 rounded-full"></div>}
      </div>
      <div>
        <h3 className="text-gray-400 font-subtitle text-[10px] uppercase font-black tracking-widest mb-1">{titulo}</h3>
        <div className={`text-3xl font-title tracking-tight ${isRedAlert ? 'text-red-600' : 'text-gray-900'}`}>
          {valor !== undefined ? valor : '-'}
        </div>
      </div>
      {subtitulo && <div className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-tighter">{subtitulo}</div>}
      
      {esTasa && valor !== undefined && (
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4 overflow-hidden">
          <div className="bg-brand-primary h-full rounded-full transition-all duration-1000" style={{ width: String(valor).replace('%', '') + '%' }}></div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { token, hasPermission } = useAuth();
  const { alerta, mostrarAlerta, cerrarAlerta } = useAlerta();
  const canExportar = hasPermission('reportes.export');
  const hoyIso = new Date().toLocaleDateString('en-CA');
  
  // Data states
  const [resumen, setResumen] = useState(null);
  const [tendencia, setTendencia] = useState([]);
  
  // UI states
  const [loadingResumen, setLoadingResumen] = useState(true);
  const [loadingTendencia, setLoadingTendencia] = useState(true);
  const [diasTendencia, setDiasTendencia] = useState(30);
  const [fechaFiltro, setFechaFiltro] = useState(hoyIso);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('');
  const [filtroRepartidorId, setFiltroRepartidorId] = useState('');
  const [modoRango, setModoRango] = useState('rapido');
  const [fechaDesde, setFechaDesde] = useState(hoyIso);
  const [fechaHasta, setFechaHasta] = useState(hoyIso);
  
  // Export states
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    cargarResumen();
    // Refresh every 5 minutes
    const interval = setInterval(cargarResumen, 300000);
    return () => clearInterval(interval);
  }, [token, fechaFiltro, filtroEmpresaId, filtroRepartidorId]);

  useEffect(() => {
    if (!token) return;
    cargarTendencia();
  }, [token, diasTendencia, modoRango, fechaDesde, fechaHasta, filtroEmpresaId, filtroRepartidorId]);

  const cargarResumen = async () => {
    if (!token) return;
    try {
      setLoadingResumen(true);
      const data = await dashboardService.resumen(token, {
        fecha: fechaFiltro,
        empresaId: filtroEmpresaId || undefined,
        repartidorId: filtroRepartidorId || undefined,
      });
      setResumen(data);
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setLoadingResumen(false);
    }
  };

  const cargarTendencia = async () => {
    if (!token) return;
    try {
      if (modoRango === 'custom' && fechaDesde > fechaHasta) {
        mostrarAlerta('error', 'La fecha desde no puede ser mayor que la fecha hasta');
        return;
      }

      setLoadingTendencia(true);
      const params = {
        empresaId: filtroEmpresaId || undefined,
        repartidorId: filtroRepartidorId || undefined,
      };

      if (modoRango === 'custom') {
        params.fechaDesde = fechaDesde;
        params.fechaHasta = fechaHasta;
      } else {
        params.dias = diasTendencia;
      }

      const data = await dashboardService.tendencia(token, params);
      // Format dates for tooltip/xaxis: YYYY-MM-DD to DD/MM
      const formatted = data.map(item => ({
        ...item,
        fecha_corta: item.fecha.substring(8, 10) + '/' + item.fecha.substring(5, 7)
      }));
      setTendencia(formatted);
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setLoadingTendencia(false);
    }
  };

  const cambiarDia = (dias) => {
    const d = new Date(fechaFiltro + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    setFechaFiltro(d.toLocaleDateString('en-CA'));
  };

  const handleExportar = async (e) => {
    e.preventDefault();
    if (!canExportar) {
      mostrarAlerta('error', 'No tienes permiso para exportar reportes');
      return;
    }

    setExportLoading(true);
    const fd = new FormData(e.target);
    const params = Object.fromEntries(fd.entries());
    Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

    try {
      const blob = await reportesService.exportar(token, params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reporte-OLM-${new Date().toISOString().substring(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setIsExportOpen(false);
      mostrarAlerta('success', 'Reporte exportado exitosamente');
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const obtenerRangoActual = () => {
    if (modoRango === 'custom') {
      return { fecha_desde: fechaDesde, fecha_hasta: fechaHasta };
    }

    const hasta = new Date();
    hasta.setHours(23, 59, 59, 999);
    const desde = new Date(hasta);
    desde.setDate(hasta.getDate() - diasTendencia + 1);
    desde.setHours(0, 0, 0, 0);

    return {
      fecha_desde: desde.toLocaleDateString('en-CA'),
      fecha_hasta: hasta.toLocaleDateString('en-CA'),
    };
  };

  const exportarExcelFiltrado = async () => {
    if (!canExportar) {
      mostrarAlerta('error', 'No tienes permiso para exportar reportes');
      return;
    }

    try {
      setExportLoading(true);
      const rango = obtenerRangoActual();
      const params = {
        ...rango,
        ...(filtroEmpresaId && { empresa_id: filtroEmpresaId }),
        ...(filtroRepartidorId && { repartidor_id: filtroRepartidorId }),
      };

      const blob = await reportesService.exportar(token, params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tendencia-Filtrada-${new Date().toISOString().substring(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      mostrarAlerta('success', 'Excel filtrado descargado');
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const exportarTablaCsv = () => {
    if (!tendencia.length) {
      mostrarAlerta('error', 'No hay datos en la tabla para exportar');
      return;
    }

    const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const encabezados = ['Fecha', 'Registradas', 'Entregadas', 'Novedades', 'Devueltas'];
    const filas = tendencia.map((item) => [
      item.fecha,
      item.registradas,
      item.entregadas,
      item.novedades,
      item.devueltas,
    ]);

    const contenido = [encabezados, ...filas]
      .map((fila) => fila.map(escapar).join(';'))
      .join('\n');

    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tabla-Tendencia-${new Date().toISOString().substring(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    mostrarAlerta('success', 'Tabla descargada correctamente');
  };

  const limpiarFiltrosAnaliticos = () => {
    setFiltroEmpresaId('');
    setFiltroRepartidorId('');
    setModoRango('rapido');
    setDiasTendencia(30);
    setFechaDesde(hoyIso);
    setFechaHasta(hoyIso);
  };

  const kpis = resumen?.kpis || {};
  const alertasActivas = resumen?.alertas?.length || 0;
  const empresaSeleccionada = resumen?.por_empresa?.find((e) => String(e.empresa_id) === String(filtroEmpresaId));
  const repartidorSeleccionado = resumen?.por_repartidor?.find((r) => String(r.repartidor_id) === String(filtroRepartidorId));

  return (
    <Layout rol="admin">
      <Alerta {...alerta} onClose={cerrarAlerta} />
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-title text-brand-dark mb-1">Centro de Comando Panorámico</h1>
          <p className="text-sm text-gray-500 font-body">Datos en tiempo real y KPI Operativos.</p>
        </div>
        
        <div className="flex gap-2">
           <button disabled={!canExportar} title={!canExportar ? 'No tienes permiso para esta accion' : 'Exportar reporte a Excel'} onClick={() => setIsExportOpen(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
             <Download className="w-4 h-4" /> Exportar Excel
           </button>
           <button onClick={cargarResumen} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-lg transition-colors flex items-center">
             <RefreshCw className={`w-4 h-4 ${loadingResumen ? 'animate-spin' : ''}`} />
           </button>
        </div>
      </div>

      {/* FILTER RESUMEN */}
      <div className="flex items-center justify-between bg-white px-5 py-4 rounded-2xl shadow-sm border border-gray-100 mb-8 font-body">
        <div className="font-bold text-gray-900 flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-light/10 text-brand-primary rounded-xl flex items-center justify-center">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-1">Periodo Visualizado</p>
            <span className="text-sm font-black">{fechaFiltro}</span>
          </div>
          {fechaFiltro === new Date().toLocaleDateString('en-CA') && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-black border border-green-200">LIVE</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => cambiarDia(-1)} className="p-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100"><ChevronLeft size={18} /></button>
          <button onClick={() => setFechaFiltro(new Date().toLocaleDateString('en-CA'))} className="px-5 py-2 bg-brand-navy text-white rounded-xl hover:opacity-90 transition-all text-xs font-bold tracking-widest uppercase shadow-md shadow-brand-navy/10 active:scale-95">Ir a Hoy</button>
          <button onClick={() => cambiarDia(1)} disabled={fechaFiltro >= new Date().toLocaleDateString('en-CA')} className="p-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100 disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="mb-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal size={18} className="text-brand-primary" />
          <h3 className="font-title text-gray-900 text-lg">Filtros Analiticos</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">Empresa</label>
            <select value={filtroEmpresaId} onChange={(e) => setFiltroEmpresaId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Todas las empresas</option>
              {resumen?.por_empresa?.map((e) => (
                <option key={e.empresa_id} value={e.empresa_id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">Repartidor</label>
            <select value={filtroRepartidorId} onChange={(e) => setFiltroRepartidorId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Todos los repartidores</option>
              {resumen?.por_repartidor?.map((r) => (
                <option key={r.repartidor_id} value={r.repartidor_id}>{r.nombre_completo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">Modo de rango</label>
            <select value={modoRango} onChange={(e) => setModoRango(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
              <option value="rapido">Rapido (1d, 7d, 30d, 90d)</option>
              <option value="custom">Personalizado (desde / hasta)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={limpiarFiltrosAnaliticos} className="w-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl px-3 py-2 text-sm font-semibold transition-colors">
              Limpiar filtros
            </button>
          </div>
        </div>

        {modoRango === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">Desde</label>
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-1">Hasta</label>
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={cargarTendencia} className="w-full bg-brand-primary hover:bg-brand-dark text-white rounded-xl px-3 py-2 text-sm font-bold transition-colors">
                Aplicar rango
              </button>
            </div>
          </div>
        )}
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-5 mb-10">
        {loadingResumen ? (
          Array(6).fill(0).map((_,i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard titulo="Registradas" valor={kpis.total_registradas} subtitulo="Nuevas hoy" icon={Package} />
            <KPICard titulo="En Ruta" valor={kpis.total_en_ruta} subtitulo="En la calle" icon={MapPin} colorClass="text-blue-500" />
            <KPICard titulo="Entregadas" valor={kpis.total_entregadas} subtitulo="Finalizadas hoy" icon={CheckCircle} colorClass="text-green-500" />
            <KPICard titulo="Novedades" valor={kpis.total_novedades} subtitulo="Incidentes hoy" icon={AlertTriangle} colorClass="text-amber-500" />
            <KPICard titulo="Efectividad" valor={kpis.tasa_efectividad} esTasa={true} icon={TrendingUp} />
            <KPICard titulo="Sin Asignar" valor={kpis.sin_asignar} subtitulo="En bodega" alerta={true} icon={PackageSearch} />
          </>
        )}
      </div>

      {/* PRIORIDADES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
          <p className="text-[11px] uppercase font-black tracking-widest text-red-500 mb-1">Critico</p>
          <p className="text-sm font-subtitle text-red-900">Guias estancadas</p>
          <p className="text-2xl font-title text-red-700 mt-2">{alertasActivas}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-[11px] uppercase font-black tracking-widest text-amber-600 mb-1">Monitoreo</p>
          <p className="text-sm font-subtitle text-amber-900">Novedades del dia</p>
          <p className="text-2xl font-title text-amber-700 mt-2">{kpis.total_novedades ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="text-[11px] uppercase font-black tracking-widest text-emerald-600 mb-1">Fortaleza</p>
          <p className="text-sm font-subtitle text-emerald-900">Entregas efectivas</p>
          <p className="text-2xl font-title text-emerald-700 mt-2">{kpis.tasa_efectividad ?? '0%'}</p>
        </div>
      </div>

      {(empresaSeleccionada || repartidorSeleccionado) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {empresaSeleccionada && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
              <p className="text-[11px] uppercase tracking-widest font-black text-emerald-600">Estadistica individual</p>
              <h4 className="font-title text-emerald-900 text-xl mt-1">Empresa: {empresaSeleccionada.nombre}</h4>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white/70 rounded-xl p-3 border border-emerald-100">
                  <p className="text-xs text-gray-500 uppercase font-bold">En transito</p>
                  <p className="text-2xl font-title text-emerald-700">{empresaSeleccionada.activas}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3 border border-emerald-100">
                  <p className="text-xs text-gray-500 uppercase font-bold">Entregadas hoy</p>
                  <p className="text-2xl font-title text-emerald-700">{empresaSeleccionada.entregadas_hoy}</p>
                </div>
              </div>
            </div>
          )}

          {repartidorSeleccionado && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
              <p className="text-[11px] uppercase tracking-widest font-black text-blue-600">Estadistica individual</p>
              <h4 className="font-title text-blue-900 text-xl mt-1">Repartidor: {repartidorSeleccionado.nombre_completo}</h4>
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="bg-white/80 rounded-xl p-3 border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase font-bold">Asig.</p>
                  <p className="text-xl font-title text-blue-700">{repartidorSeleccionado.asignadas}</p>
                </div>
                <div className="bg-white/80 rounded-xl p-3 border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase font-bold">Ent.</p>
                  <p className="text-xl font-title text-blue-700">{repartidorSeleccionado.entregadas}</p>
                </div>
                <div className="bg-white/80 rounded-xl p-3 border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase font-bold">Nov.</p>
                  <p className="text-xl font-title text-blue-700">{repartidorSeleccionado.novedades}</p>
                </div>
                <div className="bg-white/80 rounded-xl p-3 border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase font-bold">Efect.</p>
                  <p className="text-xl font-title text-blue-700">{repartidorSeleccionado.tasa}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* TENDENCIA Y REP. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* CHART */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h3 className="font-title text-gray-800 text-lg">Tendencia Temporal</h3>
            <div className="flex flex-wrap gap-2 items-center">
              {modoRango === 'rapido' && (
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                  {[1, 7, 30, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDiasTendencia(d)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${diasTendencia === d ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              )}
              <button onClick={exportarTablaCsv} className="px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700">
                Descargar tabla
              </button>
              <button disabled={!canExportar || exportLoading} onClick={exportarExcelFiltrado} className="px-3 py-2 text-xs font-bold rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
                {exportLoading ? 'Generando...' : 'Excel filtrado'}
              </button>
            </div>
          </div>

          <div className="h-72 w-full min-w-0">
            {loadingTendencia ? <SkeletonCard height="h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tendencia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="fecha_corta" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                  <Bar dataKey="registradas" name="Registradas" stackId="a" fill="#93C5FD" radius={[0,0,4,4]} />
                  <Bar dataKey="entregadas" name="Entregadas" stackId="a" fill="#34D399" />
                  <Bar dataKey="novedades" name="Novedades" stackId="a" fill="#FCD34D" />
                  <Bar dataKey="devueltas" name="Devueltas" stackId="a" fill="#F87171" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-4 border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3 text-right">Registradas</th>
                    <th className="p-3 text-right">Entregadas</th>
                    <th className="p-3 text-right">Novedades</th>
                    <th className="p-3 text-right">Devueltas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {tendencia.map((fila) => (
                    <tr key={fila.fecha} className="hover:bg-gray-50/70">
                      <td className="p-3">{fila.fecha}</td>
                      <td className="p-3 text-right">{fila.registradas}</td>
                      <td className="p-3 text-right text-green-700">{fila.entregadas}</td>
                      <td className="p-3 text-right text-amber-700">{fila.novedades}</td>
                      <td className="p-3 text-right text-red-700">{fila.devueltas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ALERTAS */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[400px]">
          <h3 className="font-title text-gray-800 text-lg mb-4 flex items-center justify-between">
            <span>Alertas Críticas</span>
            <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-bold">
              {resumen?.alertas?.length || 0}
            </span>
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {loadingResumen ? (
              <div className="space-y-3">{Array(4).fill(0).map((_,i) => <SkeletonCard key={i} height="h-16" />)}</div>
            ) : resumen?.alertas?.length > 0 ? (
              resumen.alertas.map(a => (
                <div key={a.guia_id} className="p-3 border-l-4 border-red-500 bg-red-50/50 rounded-r-lg group hover:bg-red-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <Link to={`/admin/guias?q=${a.numero_guia}`} className="font-semibold text-brand-primary hover:underline text-sm font-subtitle">
                      {a.numero_guia}
                    </Link>
                    <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">{a.horas_sin_movimiento}h estancado</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1 truncate">{a.nombre_destinatario} • <span className="uppercase font-medium">{a.estado_actual}</span></div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <CheckCircle2 className="w-10 h-10 text-green-500 opacity-80" />
                <p className="text-sm font-medium">Operación fluida, sin guías estancadas</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABLAS INFERIORES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* POR REPARTIDOR */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-brand-primary rounded-lg"><UsersIcon size={18} /></div>
            <h3 className="font-title text-gray-900 text-lg">Conductores Hoy</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/30 text-gray-400 font-subtitle text-[10px] uppercase tracking-widest font-black">
                <tr>
                  <th className="p-4 pl-6">Repartidor</th>
                  <th className="p-4 text-center">Asig.</th>
                  <th className="p-4 text-center text-green-600/70">Ent.</th>
                  <th className="p-4 text-center text-amber-600/70">Nov.</th>
                  <th className="p-4 pr-6 text-right">Efect.</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 font-body">
                {loadingResumen ? (
                  <tr><td colSpan="5" className="p-4 text-center">Cargando...</td></tr>
                ) : resumen?.por_repartidor?.sort((a,b)=>b.entregadas-a.entregadas).map(r => {
                  const numTasa = parseFloat(r.tasa);
                  let colorClass = 'bg-gray-100 text-gray-800';
                  if (numTasa >= 80) colorClass = 'bg-green-100 text-green-800';
                  else if (numTasa >= 50) colorClass = 'bg-yellow-100 text-yellow-800';
                  else if (r.entregadas > 0 || r.novedades > 0) colorClass = 'bg-red-100 text-red-800';

                  return (
                    <tr key={r.repartidor_id} className="hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-semibold text-gray-800 flex items-center gap-2">
                          {r.nombre_completo}
                          {!r.activo && <span className="text-[10px] bg-red-100 text-red-600 px-1 py-0.5 rounded">Inactivo</span>}
                        </div>
                      </td>
                      <td className="p-4 text-center">{r.asignadas}</td>
                      <td className="p-4 text-center font-medium text-green-600">{r.entregadas}</td>
                      <td className="p-4 text-center text-yellow-600">{r.novedades}</td>
                      <td className="p-4 text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${colorClass}`}>{r.tasa}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* POR EMPRESA */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Building2 size={18} /></div>
            <h3 className="font-title text-gray-900 text-lg">Empresas Aliadas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 font-body">
              <thead className="bg-gray-50/30 text-gray-400 font-subtitle text-[10px] uppercase tracking-widest font-black">
                <tr>
                  <th className="p-4 pl-6">Empresa</th>
                  <th className="p-4 text-center">En tránsito</th>
                  <th className="p-4 pr-6 text-right">Entregadas Hoy</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 font-body">
                {loadingResumen ? (
                  <tr><td colSpan="3" className="p-4 text-center">Cargando...</td></tr>
                ) : resumen?.por_empresa?.sort((a,b)=>b.activas-a.activas).map(e => (
                  <tr key={e.empresa_id} className="hover:bg-gray-50">
                    <td className="p-4 font-semibold text-gray-800">{e.nombre}</td>
                    <td className="p-4 text-center">
                      <span className="bg-blue-50 text-brand-primary px-2 py-1 rounded font-bold text-xs">{e.activas}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-medium text-green-600">{e.entregadas_hoy}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* EXPORT MODAL */}
      {isExportOpen && canExportar && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md animate-fade-in-down overflow-hidden border border-white/20">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center">
                  <FileSpreadsheet size={24} />
                </div>
                <h3 className="font-title text-xl text-gray-900">Exportar Datos</h3>
              </div>
              <button 
                onClick={() => setIsExportOpen(false)} 
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleExportar} className="p-8 font-body">

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Desde</label>
                    <input type="date" name="fecha_desde" className="w-full p-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Hasta</label>
                    <input type="date" name="fecha_hasta" className="w-full p-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Estado</label>
                  <select name="estado" className="w-full p-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Todos los estados</option>
                    <option value="registrado">Registrado</option>
                    <option value="asignado">Asignado</option>
                    <option value="en_ruta">En Ruta</option>
                    <option value="entregado">Entregado</option>
                    <option value="devuelto">Devuelto</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Empresa</label>
                  <select name="empresa_id" className="w-full p-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Todas las empresas</option>
                    {resumen?.por_empresa?.map(e => <option key={e.empresa_id} value={e.empresa_id}>{e.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Repartidor</label>
                  <select name="repartidor_id" className="w-full p-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Todos los repartidores</option>
                    {resumen?.por_repartidor?.map(r => <option key={r.repartidor_id} value={r.repartidor_id}>{r.nombre_completo}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setIsExportOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
                <button type="submit" disabled={exportLoading} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
                  {exportLoading ? 'Generando...' : 'Descargar Excel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </Layout>
  );
}
