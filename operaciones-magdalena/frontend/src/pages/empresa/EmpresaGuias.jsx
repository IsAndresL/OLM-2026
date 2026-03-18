import Layout from '../../components/Layout';

export default function EmpresaGuias() {
  return (
    <Layout>
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#ECFDF5' }}>
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mis Guías</h1>
            <p className="text-sm text-gray-500">Gestión de envíos de tu empresa</p>
          </div>
        </div>
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-sm text-emerald-700">📦 Esta sección se implementa en la <strong>Fase 2</strong>. Incluirá creación de guías, carga masiva y visualización de estados.</p>
        </div>
      </div>
    </Layout>
  );
}
