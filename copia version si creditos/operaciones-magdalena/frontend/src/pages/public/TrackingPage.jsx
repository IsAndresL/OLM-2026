import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trackingService } from '../../services/api';
import LogoPlaceholder from '../../image/logo-olm.png'; // Make sure this path exists or replace intelligently
// The user provided the logo path in Phase 1: c:\Users\AF\Documents\Proyectos Web Pages 2026\Trabajo\OLM 2026\operaciones-magdalena\frontend\src\image\logo-olm.png

export default function TrackingPage() {
  const { numero } = useParams();
  const navigate = useNavigate();
  
  const [guiaStr, setGuiaStr] = useState(numero || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMSG, setErrorMSG] = useState('');

  // Auto-search if mounted with param
  useEffect(() => {
    if (numero) {
      buscarGuia(numero);
    }
  }, [numero]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (guiaStr.trim()) {
      navigate(`/rastrear/${guiaStr.trim()}`);
    }
  };

  const buscarGuia = async (num) => {
    setLoading(true);
    setErrorMSG('');
    setData(null);
    try {
      const res = await trackingService.consultar(num);
      setData(res);
    } catch (err) {
      setErrorMSG(err.message || 'Número de guía no encontrado.');
    } finally {
      setLoading(false);
    }
  };

  const getEmoji = (estado) => {
    const emojis = {
      registrado: '📦',
      asignado: '👨‍🔧',
      en_ruta: '🚚',
      entregado: '✅',
      no_contesto: '📵',
      direccion_incorrecta: '🏠',
      reagendar: '📅',
      devuelto: '↩️'
    };
    return emojis[estado] || '📍';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-body">
      {/* Rastrear Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6 flex justify-center items-center shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src={LogoPlaceholder} alt="OLM Logo" className="h-8 object-contain" onError={(e) => { e.target.onerror = null; e.target.style.display='none'; }}/>
          <h1 className="font-title text-brand-dark font-bold text-lg md:text-xl hidden sm:block">Operaciones Logísticas del Magdalena</h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto p-4 md:p-8 flex flex-col">
        
        {/* Search Box */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 mb-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Rastrea tu envío</h2>
          <p className="text-gray-500 text-sm mb-6">Ingresa el número de guía MAG- para conocer el estado actual de tu paquete.</p>
          
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input 
              type="text" 
              placeholder="Ej: MAG-20260317-0042"
              value={guiaStr}
              onChange={(e) => setGuiaStr(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl font-mono text-center sm:text-left focus:ring-2 focus:ring-brand-light focus:border-brand-light outline-none uppercase"
              required
            />
            <button 
              type="submit" 
              disabled={loading}
              className="bg-brand-primary hover:bg-brand-light text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
        </div>

        {errorMSG && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-center animate-fade-in font-medium">
            {errorMSG}
          </div>
        )}

        {/* Tracking Data */}
        {data && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-slide-up">
            
            {/* Cabecera del pedido */}
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                  <h3 className="text-xs font-bold text-brand-primary uppercase tracking-widest mb-1">Pedido</h3>
                  <div className="text-xl font-mono font-bold text-gray-900">{data.numero_guia}</div>
                </div>
                <div className="md:text-right">
                  <p className="text-sm font-semibold text-gray-800">Para: {data.nombre_destinatario}</p>
                  <p className="text-sm text-gray-600">Destino: {data.ciudad_destino}</p>
                </div>
              </div>
            </div>

            {/* Estado actual destacado */}
            <div className="p-6 md:p-8 flex flex-col items-center justify-center border-b border-gray-100">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Estado Actual</h4>
              <div className="text-6xl mb-4">{getEmoji(data.estado_actual)}</div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 capitalize text-center mb-2">
                {data.estado_actual.replace('_', ' ')}
              </h2>
              {/* Mostramos el mensaje amigable del primer historial (si existe, asumiendo orden descendente) */}
              <p className="text-center text-gray-600 font-medium max-w-sm">
                {data.historial && data.historial.length > 0 ? data.historial[0].mensaje : ''}
              </p>
            </div>

            {/* Timeline */}
            <div className="p-6 md:p-8">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Historial de Movimientos</h4>
              
              <div className="relative border-l-2 border-gray-200 ml-3 md:ml-4 space-y-8">
                {data.historial && data.historial.map((h, i) => (
                  <div key={i} className={`relative pl-8 md:pl-10 ${i === 0 ? 'opacity-100' : 'opacity-60'}`}>
                    {/* Circle marker */}
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${i === 0 ? 'bg-brand-primary' : 'bg-gray-300'}`}></div>
                    
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4">
                      <div>
                        <h5 className={`font-bold capitalize ${i === 0 ? 'text-gray-900' : 'text-gray-700'}`}>{h.estado.replace('_', ' ')}</h5>
                        <p className="text-sm text-gray-600 mt-1">{h.mensaje}</p>
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-1 sm:mt-0 whitespace-nowrap">
                        {h.fecha} <br className="hidden sm:block" /> {h.hora}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Operaciones Logísticas del Magdalena</p>
        <p className="text-xs text-gray-400 mt-1">Llegamos donde más nadie llega.</p>
      </footer>
    </div>
  );
}
