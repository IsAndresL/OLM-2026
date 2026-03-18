import Layout from '../../components/Layout';

export default function AdminDashboard() {
  return (
    <Layout>
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
            <svg className="w-6 h-6" style={{ color: '#1D4ED8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Administrativo</h1>
            <p className="text-sm text-gray-500">Panel de control general</p>
          </div>
        </div>
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">📊 Esta sección se implementa en la <strong>Fase 4</strong>. Incluirá métricas en tiempo real, gráficas de tendencia y resúmenes operativos.</p>
        </div>
      </div>
    </Layout>
  );
}
