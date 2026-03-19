import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import logoOlm from '../image/logo-olm.png';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Truck, 
  Map,
  Route,
  MapPinned,
  Undo2,
  HandCoins,
  Wallet,
  Settings,
  LogOut, 
  ChevronRight,
} from 'lucide-react';

const navItems = {
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard',  icon: 'chart' },
    { to: '/admin/guias',     label: 'Guías',      icon: 'doc' },
    { to: '/admin/mapa',      label: 'Mapa en vivo', icon: 'map' },
    { to: '/admin/rutas',     label: 'Rutas', icon: 'route' },
    { to: '/admin/zonas',     label: 'Zonas', icon: 'zone' },
    { to: '/admin/devoluciones', label: 'Devoluciones', icon: 'return' },
    { to: '/admin/usuarios',  label: 'Usuarios',   icon: 'users' },
    { to: '/admin/liquidaciones', label: 'Liquidaciones', icon: 'money' },
    { to: '/admin/caja', label: 'Caja contraentrega', icon: 'cash' },
    { to: '/admin/tarifas', label: 'Tarifas', icon: 'settings' },
  ],
  empresa: [
    { to: '/empresa/dashboard', label: 'Dashboard', icon: 'chart' },
    { to: '/empresa/guias',     label: 'Guías',     icon: 'doc' },
  ],
  repartidor: [
    { to: '/repartidor/guias', label: 'Mis entregas', icon: 'truck' },
  ],
};

function Icon({ name, className }) {
  const props = { className, size: 20, strokeWidth: 2 };
  switch (name) {
    case 'chart': return <LayoutDashboard {...props} />;
    case 'doc':   return <FileText {...props} />;
    case 'users': return <Users {...props} />;
    case 'truck': return <Truck {...props} />;
    case 'map': return <Map {...props} />;
    case 'route': return <Route {...props} />;
    case 'zone': return <MapPinned {...props} />;
    case 'return': return <Undo2 {...props} />;
    case 'money': return <HandCoins {...props} />;
    case 'cash': return <Wallet {...props} />;
    case 'settings': return <Settings {...props} />;
    default:      return null;
  }
}


export default function Layout({ children }) {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const items = (navItems[user?.rol] || []).filter((item) => {
    if (user?.rol !== 'admin') return true;
    if (item.to === '/admin/dashboard') return hasPermission('dashboard.view');
    if (item.to === '/admin/guias') return hasPermission('guias.view');
    if (item.to === '/admin/mapa') return hasPermission('mapa.view');
    if (item.to === '/admin/rutas') return hasPermission('rutas.manage');
    if (item.to === '/admin/zonas') return hasPermission('zonas.manage');
    if (item.to === '/admin/devoluciones') return hasPermission('devoluciones.view');
    if (item.to === '/admin/usuarios') return hasPermission('usuarios.view');
    if (item.to === '/admin/liquidaciones') return hasPermission('liquidaciones.view');
    if (item.to === '/admin/caja') return hasPermission('caja_cod.view');
    if (item.to === '/admin/tarifas') return hasPermission('tarifas.manage');
    return true;
  });
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar_url]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img src={logoOlm} alt="OLM Logo" className="h-10 object-contain drop-shadow" />
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">OLM</p>
              <p className="text-[10px] text-gray-400 leading-tight">Operaciones Logísticas</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-3 rounded-xl text-sm font-bold transition-all duration-200 group ${
                  isActive
                    ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/25'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-brand-primary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <Icon name={item.icon} className="transition-transform group-hover:scale-110" />
                    {item.label}
                  </div>
                  {!isActive && <ChevronRight size={14} className="opacity-0 group-hover:opacity-50 transition-all" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border border-gray-100 bg-gray-200">
              {user?.avatar_url && !avatarError ? (
                <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" onError={() => setAvatarError(true)} />
              ) : (
                <span className="text-xs font-semibold text-gray-600">
                  {user?.nombre_completo?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.nombre_completo}</p>
              <p className="text-[11px] text-gray-400 capitalize">{user?.rol}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 ml-64">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <p className="text-sm text-gray-500">Bienvenido,</p>
            <h2 className="text-lg font-semibold text-gray-900">{user?.nombre_completo}</h2>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95 group"
          >
            <LogOut size={16} className="transition-transform group-hover:-translate-x-1" />
            CERRAR SESIÓN
          </button>

        </header>

        {/* Page content */}
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
