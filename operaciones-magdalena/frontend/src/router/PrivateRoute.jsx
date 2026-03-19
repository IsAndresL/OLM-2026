import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PrivateRoute({ children, roles = [], permission = null }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Cargando...</p>
    </div>
  );

  if (!user)                                    return <Navigate to="/login" replace />;
  if (roles.length > 0 && !roles.includes(user.rol)) return <Navigate to="/sin-acceso" replace />;
  if (permission && user.rol === 'admin' && !hasPermission(permission)) return <Navigate to="/sin-acceso" replace />;
  return children;
}
