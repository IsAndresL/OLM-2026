import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import PrivateRoute from './router/PrivateRoute';

import LoginPage        from './pages/LoginPage';
import SinAccesoPage    from './pages/SinAccesoPage';
import AdminDashboard   from './pages/admin/AdminDashboard';
import AdminGuias       from './pages/admin/AdminGuias';
import AdminUsuarios    from './pages/admin/AdminUsuarios';
import AdminMapa        from './pages/admin/AdminMapa';
import AdminDevoluciones from './pages/admin/AdminDevoluciones';
import AdminLiquidaciones from './pages/admin/AdminLiquidaciones';
import AdminCorteCaja   from './pages/admin/AdminCorteCaja';
import AdminTarifas     from './pages/admin/AdminTarifas';
import EmpresaDashboard from './pages/empresa/EmpresaDashboard';
import EmpresaGuias     from './pages/empresa/EmpresaGuias';
import RepartidorGuias  from './pages/repartidor/RepartidorGuias';
import RepartidorCOD    from './pages/repartidor/RepartidorCOD';
import TrackingPage     from './pages/public/TrackingPage';

function PoweredByBadge() {
  const { user } = useAuth();
  const location = useLocation();
  const [hayModalAbierto, setHayModalAbierto] = useState(false);

  useEffect(() => {
    const detectarModal = () => {
      const hayOverlay = Boolean(document.querySelector('.fixed.inset-0'));
      const hayDialogo = Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]'));
      setHayModalAbierto(hayOverlay || hayDialogo);
    };

    detectarModal();

    const observer = new MutationObserver(detectarModal);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'role', 'aria-modal'],
    });

    return () => observer.disconnect();
  }, []);

  const esFlujoRepartidor = user?.rol === 'repartidor' || location.pathname.startsWith('/repartidor');
  if (esFlujoRepartidor || hayModalAbierto) return null;

  return (
    <div className="fixed right-1 bottom-1 md:right-2 md:bottom-2 z-[120] pointer-events-none">
      <div className="bg-white/90 backdrop-blur border border-gray-200 shadow-sm rounded-full px-2.5 py-1 text-[10px] font-semibold text-gray-600">
        Powered by Ing. Andres Luna
      </div>
    </div>
  );
}

function HomeRedirect() {
  const { user, hasPermission } = useAuth();
  if (!user)                   return <Navigate to="/login" replace />;
  if (user.rol === 'admin') {
    if (hasPermission('dashboard.view')) return <Navigate to="/admin/dashboard" replace />;
    if (hasPermission('guias.view')) return <Navigate to="/admin/guias" replace />;
    if (hasPermission('mapa.view')) return <Navigate to="/admin/mapa" replace />;
    if (hasPermission('devoluciones.view')) return <Navigate to="/admin/devoluciones" replace />;
    if (hasPermission('usuarios.view')) return <Navigate to="/admin/usuarios" replace />;
    if (hasPermission('liquidaciones.view')) return <Navigate to="/admin/liquidaciones" replace />;
    if (hasPermission('caja_cod.view')) return <Navigate to="/admin/caja" replace />;
    if (hasPermission('tarifas.manage')) return <Navigate to="/admin/tarifas" replace />;
    return <Navigate to="/sin-acceso" replace />;
  }
  if (user.rol === 'empresa')    return <Navigate to="/empresa/dashboard" replace />;
  if (user.rol === 'repartidor') return <Navigate to="/repartidor/guias" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"             element={<HomeRedirect />} />
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/sin-acceso"   element={<SinAccesoPage />} />
          <Route path="/rastrear"     element={<TrackingPage />} />
          <Route path="/rastrear/:numero" element={<TrackingPage />} />

          <Route path="/admin/dashboard"
            element={<PrivateRoute roles={['admin']} permission="dashboard.view"><AdminDashboard /></PrivateRoute>} />
          <Route path="/admin/guias"
            element={<PrivateRoute roles={['admin']} permission="guias.view"><AdminGuias /></PrivateRoute>} />
          <Route path="/admin/mapa"
            element={<PrivateRoute roles={['admin']} permission="mapa.view"><AdminMapa /></PrivateRoute>} />
          <Route path="/admin/devoluciones"
            element={<PrivateRoute roles={['admin']} permission="devoluciones.view"><AdminDevoluciones /></PrivateRoute>} />
          <Route path="/admin/usuarios"
            element={<PrivateRoute roles={['admin']} permission="usuarios.view"><AdminUsuarios /></PrivateRoute>} />
          <Route path="/admin/liquidaciones"
            element={<PrivateRoute roles={['admin']} permission="liquidaciones.view"><AdminLiquidaciones /></PrivateRoute>} />
          <Route path="/admin/caja"
            element={<PrivateRoute roles={['admin']} permission="caja_cod.view"><AdminCorteCaja /></PrivateRoute>} />
          <Route path="/admin/tarifas"
            element={<PrivateRoute roles={['admin']} permission="tarifas.manage"><AdminTarifas /></PrivateRoute>} />

          <Route path="/empresa/dashboard"
            element={<PrivateRoute roles={['empresa']}><EmpresaDashboard /></PrivateRoute>} />
          <Route path="/empresa/guias"
            element={<PrivateRoute roles={['empresa']}><EmpresaGuias /></PrivateRoute>} />

          <Route path="/repartidor/guias"
            element={<PrivateRoute roles={['repartidor']}><RepartidorGuias /></PrivateRoute>} />
          <Route path="/repartidor/contraentrega"
            element={<PrivateRoute roles={['repartidor']}><RepartidorCOD /></PrivateRoute>} />
          <Route path="/repartidor/cod" element={<Navigate to="/repartidor/contraentrega" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <PoweredByBadge />
      </BrowserRouter>
    </AuthProvider>
  );
}
