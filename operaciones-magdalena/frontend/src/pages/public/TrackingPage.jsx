import { useState } from 'react';
import { useParams } from 'react-router-dom';

export default function TrackingPage() {
  const { numero } = useParams();
  const [guia, setGuia] = useState(numero || '');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: '#1D4ED8' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.588-.75H14.25M3.75 15.75V4.875c0-.621.504-1.125 1.125-1.125h11.25c.621 0 1.125.504 1.125 1.125v11.25M3.75 15.75h10.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">OLM</p>
              <p className="text-[10px] text-gray-400">Rastreo de envío</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Rastrea tu envío</h1>
          <p className="text-sm text-gray-500">Ingresa tu número de guía para consultar el estado de tu paquete</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={guia}
              onChange={(e) => setGuia(e.target.value)}
              placeholder="Ej: MAG-20260317-0001"
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button
              className="px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors duration-150 hover:opacity-90"
              style={{ backgroundColor: '#1D4ED8' }}
            >
              Buscar
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">🔍 El rastreo en tiempo real se implementa en la <strong>Fase 3</strong>. Podrás ver el estado actualizado de tu envío paso a paso.</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-8">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} Operaciones Logísticas del Magdalena
        </p>
      </div>
    </div>
  );
}
