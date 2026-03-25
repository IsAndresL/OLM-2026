import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { normalizeAdminPermissions } from '../constants/permissions';
import { authService } from '../services/api';

const AuthContext = createContext(null);
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_WARNING_WINDOW_MS = 60 * 1000;
const DEFAULT_PING_MS = 60 * 1000;

const IDLE_TIMEOUT_MS = Math.max(Number(import.meta.env.VITE_IDLE_TIMEOUT_MS || DEFAULT_IDLE_TIMEOUT_MS), 60 * 1000);
const WARNING_WINDOW_MS = Math.min(
  Math.max(Number(import.meta.env.VITE_IDLE_WARNING_MS || DEFAULT_WARNING_WINDOW_MS), 15 * 1000),
  IDLE_TIMEOUT_MS - 1000
);
const HEARTBEAT_MS = Math.max(Number(import.meta.env.VITE_AUTH_PING_MS || DEFAULT_PING_MS), 30 * 1000);

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
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [secondsToLogout, setSecondsToLogout] = useState(Math.ceil(WARNING_WINDOW_MS / 1000));

  const tokenRef = useRef(null);
  const userRef = useRef(null);
  const deadlineRef = useRef(0);
  const warnTimeoutRef = useRef(null);
  const logoutTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    tokenRef.current = token;
    userRef.current = user;
  }, [token, user]);

  function clearInactivityTimers() {
    if (warnTimeoutRef.current) clearTimeout(warnTimeoutRef.current);
    if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    warnTimeoutRef.current = null;
    logoutTimeoutRef.current = null;
    countdownIntervalRef.current = null;
  }

  function clearLocalSession() {
    setUser(null);
    setToken(null);
    setShowIdleWarning(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearInactivityTimers();
  }

  function notifyServerLogout(jwtToken) {
    if (!jwtToken) return;
    fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwtToken}` },
      keepalive: true,
    }).catch(() => {});
  }

  function updateIdleCountdown() {
    const remainingMs = Math.max(deadlineRef.current - Date.now(), 0);
    setSecondsToLogout(Math.ceil(remainingMs / 1000));
  }

  function executeLogout({ notifyServer = true, tokenOverride = null } = {}) {
    const activeToken = tokenOverride || tokenRef.current;
    if (notifyServer && activeToken) notifyServerLogout(activeToken);
    clearLocalSession();
  }

  function resetInactivityTimers() {
    if (!tokenRef.current || !userRef.current) return;

    clearInactivityTimers();
    setShowIdleWarning(false);
    deadlineRef.current = Date.now() + IDLE_TIMEOUT_MS;

    const warningStartsInMs = Math.max(IDLE_TIMEOUT_MS - WARNING_WINDOW_MS, 0);
    warnTimeoutRef.current = setTimeout(() => {
      setShowIdleWarning(true);
      updateIdleCountdown();
      countdownIntervalRef.current = setInterval(updateIdleCountdown, 1000);
    }, warningStartsInMs);

    logoutTimeoutRef.current = setTimeout(() => {
      executeLogout({ notifyServer: true, tokenOverride: tokenRef.current });
    }, IDLE_TIMEOUT_MS);
  }

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
        clearLocalSession();
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
    executeLogout({ notifyServer: true });
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

  useEffect(() => {
    if (!token || !user) {
      clearInactivityTimers();
      setShowIdleWarning(false);
      return;
    }

    const onActivity = () => {
      resetInactivityTimers();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') resetInactivityTimers();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);

    resetInactivityTimers();

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInactivityTimers();
    };
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;

    authService.ping(token).catch(() => {});
    const id = setInterval(() => {
      const activeToken = tokenRef.current;
      if (!activeToken) return;
      authService.ping(activeToken).catch(() => {});
    }, HEARTBEAT_MS);

    return () => clearInterval(id);
  }, [token, user]);

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout, updateUser, hasPermission,
      isAdmin:       user?.rol === 'admin',
      isEmpresa:     user?.rol === 'empresa',
      isRepartidor:  user?.rol === 'repartidor',
      isPrincipalAdmin: Boolean(user?.es_principal),
    }}>
      {children}
      {showIdleWarning && (
        <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-[2px] px-4 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-2xl border border-amber-200 shadow-2xl p-5 sm:p-6 font-body animate-fade-in">
            <p className="text-xs font-black uppercase tracking-wider text-amber-600 mb-2">Sesion por expirar</p>
            <h3 className="text-lg font-title text-slate-900">Detectamos inactividad</h3>
            <p className="text-sm text-slate-600 mt-2">
              Tu sesion se cerrara automaticamente en <span className="font-bold text-amber-700">{secondsToLogout}s</span> por seguridad.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => executeLogout({ notifyServer: true })}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cerrar ahora
              </button>
              <button
                type="button"
                onClick={resetInactivityTimers}
                className="px-4 py-2.5 rounded-xl bg-brand-primary text-white font-bold hover:bg-brand-navy transition-colors"
              >
                Seguir conectado
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe estar dentro de <AuthProvider>');
  return ctx;
}
