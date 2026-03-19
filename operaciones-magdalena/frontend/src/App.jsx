import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import PrivateRoute from './router/PrivateRoute';

import LoginPage        from './pages/LoginPage';
import SinAccesoPage    from './pages/SinAccesoPage';
import AdminDashboard   from './pages/admin/AdminDashboard';
import AdminGuias       from './pages/admin/AdminGuias';
import AdminUsuarios    from './pages/admin/AdminUsuarios';
import AdminMapa        from './pages/admin/AdminMapa';
import AdminRutas       from './pages/admin/AdminRutas';
import AdminZonas       from './pages/admin/AdminZonas';
import AdminDevoluciones from './pages/admin/AdminDevoluciones';
import AdminLiquidaciones from './pages/admin/AdminLiquidaciones';
import AdminCorteCaja   from './pages/admin/AdminCorteCaja';
import AdminTarifas     from './pages/admin/AdminTarifas';
import EmpresaDashboard from './pages/empresa/EmpresaDashboard';
import EmpresaGuias     from './pages/empresa/EmpresaGuias';
import RepartidorGuias  from './pages/repartidor/RepartidorGuias';
import RepartidorCOD    from './pages/repartidor/RepartidorCOD';
import TrackingPage     from './pages/public/TrackingPage';

function HomeRedirect() {
  const { user, hasPermission } = useAuth();
  if (!user)                   return <Navigate to="/login" replace />;
  if (user.rol === 'admin') {
    if (hasPermission('dashboard.view')) return <Navigate to="/admin/dashboard" replace />;
    if (hasPermission('guias.view')) return <Navigate to="/admin/guias" replace />;
    if (hasPermission('mapa.view')) return <Navigate to="/admin/mapa" replace />;
    if (hasPermission('rutas.manage')) return <Navigate to="/admin/rutas" replace />;
    if (hasPermission('zonas.manage')) return <Navigate to="/admin/zonas" replace />;
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
          <Route path="/admin/rutas"
            element={<PrivateRoute roles={['admin']} permission="rutas.manage"><AdminRutas /></PrivateRoute>} />
          <Route path="/admin/zonas"
            element={<PrivateRoute roles={['admin']} permission="zonas.manage"><AdminZonas /></PrivateRoute>} />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
