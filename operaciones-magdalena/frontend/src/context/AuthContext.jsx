import { createContext, useContext, useState, useEffect } from 'react';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
    setLoading(false);
  }, []);

  function login(userData, jwtToken) {
    setUser(userData); setToken(jwtToken);
    localStorage.setItem('token', jwtToken);
    localStorage.setItem('user', JSON.stringify(userData));
  }

  function logout() {
    setUser(null); setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout,
      isAdmin:       user?.rol === 'admin',
      isEmpresa:     user?.rol === 'empresa',
      isRepartidor:  user?.rol === 'repartidor',
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
