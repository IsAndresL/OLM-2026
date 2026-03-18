import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import PrivateRoute from './router/PrivateRoute';

import LoginPage        from './pages/LoginPage';
import SinAccesoPage    from './pages/SinAccesoPage';
import AdminDashboard   from './pages/admin/AdminDashboard';
import AdminGuias       from './pages/admin/AdminGuias';
import AdminUsuarios    from './pages/admin/AdminUsuarios';
import EmpresaDashboard from './pages/empresa/EmpresaDashboard';
import EmpresaGuias     from './pages/empresa/EmpresaGuias';
import RepartidorGuias  from './pages/repartidor/RepartidorGuias';
import TrackingPage     from './pages/public/TrackingPage';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user)                   return <Navigate to="/login" replace />;
  if (user.rol === 'admin')      return <Navigate to="/admin/dashboard" replace />;
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
            element={<PrivateRoute roles={['admin']}><AdminDashboard /></PrivateRoute>} />
          <Route path="/admin/guias"
            element={<PrivateRoute roles={['admin']}><AdminGuias /></PrivateRoute>} />
          <Route path="/admin/usuarios"
            element={<PrivateRoute roles={['admin']}><AdminUsuarios /></PrivateRoute>} />

          <Route path="/empresa/dashboard"
            element={<PrivateRoute roles={['empresa']}><EmpresaDashboard /></PrivateRoute>} />
          <Route path="/empresa/guias"
            element={<PrivateRoute roles={['empresa']}><EmpresaGuias /></PrivateRoute>} />

          <Route path="/repartidor/guias"
            element={<PrivateRoute roles={['repartidor']}><RepartidorGuias /></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
