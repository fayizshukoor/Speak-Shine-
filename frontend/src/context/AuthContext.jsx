import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import api, { ensureFreshToken } from "../api/client";
import { getSharedSocket } from "../hooks/useSocket";

const AuthContext = createContext(null);

// Proactive refresh interval — refresh 1 min before the 15-min access token expires
const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

// Sentinel used when auth is cookie-based (no token in localStorage)
const COOKIE_AUTH_SENTINEL = "cookie-session";

export function AuthProvider({ children }) {
  // User profile lives in memory only — never persisted to localStorage
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  // token is exposed for socket connections — uses legacy localStorage value
  // or the sentinel string when fully on cookie auth
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const refreshTimerRef = useRef(null);

  // Schedule a proactive silent token refresh every 14 minutes
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(async () => {
      try {
        await api.post("/auth/refresh", {});
        console.log("[Auth] 🔄 Proactive token refresh succeeded");
      } catch {
        console.warn("[Auth] Proactive refresh failed — session expired");
        clearInterval(refreshTimerRef.current);
        setUser(null);
        setToken(null);
        window.location.href = "/login";
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  const stopRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Boot: try to restore session via cookie-based silent refresh
  useEffect(() => {
    let cancelled = false;
    localStorage.removeItem("user"); // wipe stale persisted data

    (async () => {
      const sessionValid = await ensureFreshToken();
      if (cancelled) return;

      if (sessionValid) {
        try {
          const { data } = await api.get("/users/me");
          if (!cancelled && data?.auth) {
            setUser({
              phone: data.auth.phone,
              role:  data.auth.role,
              name:  data.auth.name,
              // paid comes from the User tracking document
              paid:  data.user?.paid ?? false,
            });
            // After migration: no localStorage token → use sentinel for socket
            setToken(localStorage.getItem("token") || COOKIE_AUTH_SENTINEL);
            scheduleRefresh();
          }
        } catch (err) {
          console.warn("[Auth] Failed to load profile on boot:", err?.message);
        }
      }
      if (!cancelled) setBooting(false);
    })();

    return () => { cancelled = true; };
  }, [scheduleRefresh]);

  const clearSession = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("dashboard_cache");
    stopRefresh();
    setUser(null);
    setToken(null);
  }, [stopRefresh]);

  const login = useCallback((userData) => {
    // Tokens are set as httpOnly cookies by the server — just store user in memory
    setUser(userData);
    setToken(COOKIE_AUTH_SENTINEL);
    scheduleRefresh();
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
    } catch {}
    clearSession();
  }, [clearSession]);

  // Listen for server-pushed force:logout
  useEffect(() => {
    if (!user || booting) return;
    const socketToken = localStorage.getItem("token") || COOKIE_AUTH_SENTINEL;
    const socket = getSharedSocket(socketToken);

    const onForceLogout = ({ reason } = {}) => {
      console.warn("[Auth] Force logout received:", reason);
      clearSession();
      setTimeout(() => {
        window.location.href = "/login?reason=disabled";
      }, 100);
    };

    socket.on("force:logout", onForceLogout);
    return () => socket.off("force:logout", onForceLogout);
  }, [user, booting, clearSession]);

  useEffect(() => () => stopRefresh(), [stopRefresh]);

  return (
    <AuthContext.Provider value={{ user, token, booting, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
