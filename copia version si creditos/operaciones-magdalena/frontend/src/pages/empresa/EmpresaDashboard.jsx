import { useState, useEffect } from 'react';
import { 
  Download, 
  Package, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  ArrowRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Line 
} from 'recharts';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useAlerta from '../../hooks/useAlerta';
import Layout from '../../components/Layout';
import Alerta from '../../components/Alerta';
import BadgeEstado from '../../components/BadgeEstado';
import { dashboardService, reportesService } from '../../services/api';

function SkeletonCard({ height = "h-32" }) {
  return <div className={`bg-gray-100 animate-pulse rounded-[2rem] ${height} w-full`}></div>;
}



function KPICard({ titulo, valor, subtitulo, esTasa, icon: IconComponent, colorClass = "text-brand-primary" }) {
  return (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 transition-all hover:shadow-md group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-xl bg-gray-50 group-hover:bg-brand-light/20 transition-colors ${colorClass}`}>
          {IconComponent && <IconComponent size={20} />}
        </div>
      </div>
      <div>
        <h3 className="text-gray-400 font-subtitle text-[10px] uppercase font-black tracking-widest mb-1">{titulo}</h3>
        <div className="text-3xl font-title tracking-tight text-gray-900">{valor !== undefined ? valor : '-'}</div>
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


export default function EmpresaDashboard() {
  const { token, user } = useAuth();
  const { alerta, mostrarAlerta, cerrarAlerta } = useAlerta();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const res = await dashboardService.empresa(token);
      
      // Formatear fechas para el gráfico
      if (res.tendencia_semanal) {
        res.tendencia_semanal = res.tendencia_semanal.map(item => ({
          ...item,
          fecha_corta: item.fecha.substring(8, 10) + '/' + item.fecha.substring(5, 7)
        }));
      }
      
      setData(res);
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportar = async () => {
    setExportLoading(true);
    try {
      // Por defecto exporta todo su histórico
      const blob = await reportesService.exportar(token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Mis-Envios-${new Date().toISOString().substring(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      mostrarAlerta('success', 'Reporte descargado correctamente');
    } catch (err) {
      mostrarAlerta('error', err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const kpis = data?.kpis || {};

  return (
    <Layout rol="empresa">
      <Alerta {...alerta} onClose={cerrarAlerta} />
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-title text-brand-dark mb-1">Mi Resumen</h1>
          <p className="text-sm text-gray-500 font-body">Métricas de desempeño de {user?.email}</p>
        </div>
        <button onClick={handleExportar} disabled={exportLoading} className="bg-brand-navy hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">
          <Download className="w-4 h-4" /> {exportLoading ? 'Exportando...' : 'Exportar Mis Guías'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
        {loading ? (
          Array(4).fill(0).map((_,i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard titulo="En Tránsito" valor={kpis.total_activas} subtitulo="Guías activas" icon={Package} colorClass="text-brand-primary" />
            <KPICard titulo="Entregadas" valor={kpis.total_entregadas} subtitulo="Exitosas histórico" icon={CheckCircle} colorClass="text-green-500" />
            <KPICard titulo="Novedades" valor={kpis.total_novedades} subtitulo="Con incidentes" icon={AlertTriangle} colorClass="text-amber-500" />
            <KPICard titulo="Efectividad" valor={kpis.tasa_efectividad} esTasa={true} icon={TrendingUp} colorClass="text-blue-500" />
          </>
        )}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* CHART */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-title text-gray-800 text-lg mb-6">Últimos 7 Días</h3>
          <div className="h-64 w-full">
            {loading ? <SkeletonCard height="h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.tendencia_semanal} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="fecha_corta" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="registradas" name="Registradas" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="entregadas" name="Entregadas" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* RECIENTES */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[400px]">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
            <div className="flex items-center gap-3">
               <div className="p-2 bg-brand-light/20 text-brand-primary rounded-xl"><Clock size={18} /></div>
               <h3 className="font-title text-gray-900 text-lg">Últimas Guías</h3>
            </div>
            <Link to="/empresa/guias" className="flex items-center gap-1 text-xs text-brand-primary hover:text-brand-navy font-black uppercase tracking-tighter transition-colors">
               Ver Todas <ArrowRight size={14} />
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              Array(3).fill(0).map((_,i) => <SkeletonCard key={i} height="h-16" />)
            ) : data?.recientes?.length > 0 ? (
              data.recientes.map(g => (
                <div key={g.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors gap-2">
                  <div>
                    <div className="font-title text-sm text-brand-dark">{g.numero_guia}</div>
                    <div className="text-xs text-gray-500 font-body truncate max-w-[180px]">{g.nombre_destinatario}</div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                    <span className="text-[10px] text-gray-400 font-body">{g.created_at?.substring(0,10)}</span>
                    <BadgeEstado estado={g.estado_actual} />
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <p className="text-sm">No tienes guías operativas aún.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
}
