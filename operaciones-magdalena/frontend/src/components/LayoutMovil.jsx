import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import logoOlm from '../image/logo-olm.png';
import { HandCoins, LogOut, Truck } from 'lucide-react';

const navItems = {
  repartidor: [
    { to: '/repartidor/guias', label: 'Mis entregas', icon: 'truck' },
    { to: '/repartidor/contraentrega', label: 'Mi contraentrega', icon: 'cash' },
  ],
};

function Icon({ name }) {
  const props = { size: 18, strokeWidth: 2 };
  if (name === 'truck') return <Truck {...props} />;
  if (name === 'cash') return <HandCoins {...props} />;
  return null;
}

export default function LayoutMovil({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [avatarError, setAvatarError] = useState(false);
  const items = navItems[user?.rol] || [];

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar_url]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-body pb-safe">
      {/* Mobile Header */}
      <header className="bg-brand-navy text-white px-4 py-3 flex justify-between items-center shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          {/* Avatar / Brand Logo */}
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm overflow-hidden border border-brand-light/20">
            {user?.avatar_url && !avatarError ? (
              <img src={user.avatar_url} alt="User" className="w-full h-full object-cover" onError={() => setAvatarError(true)} />
            ) : (
              <img src={logoOlm} alt="OLM" className="h-6 w-auto object-contain" />
            )}
          </div>
          <div>
            <h1 className="font-title text-sm font-semibold">{title || 'OLM Repartidor'}</h1>
            <p className="text-[10px] text-gray-300 truncate max-w-[120px]">{user?.nombre_completo || 'Usuario'}</p>
          </div>
        </div>
        
        <button 
          onClick={handleLogout}
          className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 active:scale-90"
        >
          <LogOut size={18} />
        </button>
      </header>


      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden p-4 pb-24">
        {children}
      </main>

      {items.length > 0 && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 grid grid-cols-2 px-2 py-2 shadow-[0_-8px_20px_rgba(0,0,0,0.06)]">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold transition-all ${isActive ? 'text-brand-primary bg-brand-primary/10' : 'text-gray-500'}`}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
