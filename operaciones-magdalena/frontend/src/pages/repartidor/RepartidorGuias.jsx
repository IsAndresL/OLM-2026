import Layout from '../../components/Layout';

export default function RepartidorGuias() {
  return (
    <Layout>
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFFBEB' }}>
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.588-.75H14.25M3.75 15.75V4.875c0-.621.504-1.125 1.125-1.125h11.25c.621 0 1.125.504 1.125 1.125v11.25M3.75 15.75h10.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mis Entregas</h1>
            <p className="text-sm text-gray-500">Guías asignadas para entrega</p>
          </div>
        </div>
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">🚚 Esta sección se implementa en la <strong>Fase 3</strong>. Incluirá lista de guías asignadas, actualización de estados y carga de evidencias fotográficas.</p>
        </div>
      </div>
    </Layout>
  );
}
