import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import logoOlm from '../image/logo-olm.png';
import { LogOut } from 'lucide-react';

export default function LayoutMovil({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="User" className="w-full h-full object-cover" />
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
      <main className="flex-1 overflow-x-hidden p-4">
        {children}
      </main>
    </div>
  );
}
