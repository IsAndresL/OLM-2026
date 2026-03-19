import { createContext, useContext, useState, useEffect } from 'react';
import { normalizeAdminPermissions } from '../constants/permissions';
const AuthContext = createContext(null);
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function normalizeUser(rawUser) {
  if (!rawUser) return null;
  const isPrincipal = Boolean(rawUser.es_principal);
  return {
    ...rawUser,
    es_principal: isPrincipal,
    permisos: normalizeAdminPermissions(rawUser.permisos || {}, isPrincipal),
  };
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const t = localStorage.getItem('token');
      const u = localStorage.getItem('user');

      if (!t || !u) {
        if (isMounted) setLoading(false);
        return;
      }

      const cachedUser = JSON.parse(u);
      const normalizedCachedUser = normalizeUser(cachedUser);
      if (isMounted) {
        setToken(t);
        setUser(normalizedCachedUser);
      }

      try {
        const res = await fetch(`${BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${t}` }
        });

        if (!res.ok) throw new Error('Sesion invalida');
        const data = await res.json();
        if (!isMounted) return;

        const freshUser = data?.user ? normalizeUser({ ...cachedUser, ...data.user }) : normalizedCachedUser;
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
      } catch {
        if (!isMounted) return;
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  function login(userData, jwtToken) {
    const normalized = normalizeUser(userData);
    setUser(normalized); setToken(jwtToken);
    localStorage.setItem('token', jwtToken);
    localStorage.setItem('user', JSON.stringify(normalized));
  }

  function logout() {
    setUser(null); setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  function updateUser(newData) {
    const updated = normalizeUser({ ...user, ...newData });
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  }

  function hasPermission(permission) {
    if (!user || user.rol !== 'admin') return false;
    if (user.es_principal) return true;
    return Boolean(user.permisos?.[permission]);
  }

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout, updateUser, hasPermission,
      isAdmin:       user?.rol === 'admin',
      isEmpresa:     user?.rol === 'empresa',
      isRepartidor:  user?.rol === 'repartidor',
      isPrincipalAdmin: Boolean(user?.es_principal),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe estar dentro de <AuthProvider>');
  return ctx;
}
