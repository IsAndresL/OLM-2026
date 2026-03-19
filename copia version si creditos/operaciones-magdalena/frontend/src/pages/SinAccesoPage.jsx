import { useNavigate } from 'react-router-dom';

export default function SinAccesoPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso denegado</h1>
        <p className="text-gray-500 mb-8 max-w-sm">
          No tienes permisos para acceder a esta sección. Contacta al administrador si crees que esto es un error.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 text-white font-medium rounded-lg text-sm transition-colors duration-200 hover:opacity-90"
          style={{ backgroundColor: '#1D4ED8' }}
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
