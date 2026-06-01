import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { ensureFreshToken } from "../api/client";
import { getSharedSocket } from "../hooks/useSocket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // User profile is NOT persisted to localStorage (avoids exposing phone/name on
  // disk). It lives in memory only and is re-fetched from /users/me on boot.
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  // true while we proactively refresh an expiring token on boot, so we
  // don't fire protected requests / connect the socket with a dead token
  const [booting, setBooting] = useState(() => !!localStorage.getItem("token"));

  // Proactive boot refresh + profile fetch — runs once before protected UI renders
  useEffect(() => {
    let cancelled = false;
    // Wipe any stale persisted profile from older app versions.
    localStorage.removeItem("user");
    if (!localStorage.getItem("token")) {
      setBooting(false);
      return;
    }
    (async () => {
      const fresh = await ensureFreshToken();
      if (cancelled) return;
      if (fresh) setToken(fresh);
      try {
        const { data } = await api.get("/users/me");
        if (!cancelled && data?.auth) {
          setUser({ phone: data.auth.phone, role: data.auth.role, name: data.auth.name });
        }
      } catch (err) {
        console.warn("[Auth] Failed to load profile on boot:", err?.message);
      }
      if (!cancelled) setBooting(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("dashboard_cache"); // clear stale dashboard data on logout
    setToken(null);
    setUser(null);
  }, []);

  const login = (accessToken, userData, refreshToken) => {
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    // userData (phone/role/name) is kept in memory only — not persisted.
    setToken(accessToken);
    setUser(userData);
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      try { await api.post("/auth/logout", { refreshToken }); } catch {}
    }
    clearSession();
  };

  // Listen for server-pushed force:logout (e.g. admin disables account)
  useEffect(() => {
    if (!token || booting) return;

    const socket = getSharedSocket(token);

    const onForceLogout = ({ reason } = {}) => {
      console.warn("[Auth] Force logout received:", reason);
      clearSession();
      // Small delay so the socket event is fully processed before redirect
      setTimeout(() => {
        window.location.href = "/login?reason=disabled";
      }, 100);
    };

    socket.on("force:logout", onForceLogout);
    return () => socket.off("force:logout", onForceLogout);
  }, [token, booting, clearSession]);

  return (
    <AuthContext.Provider value={{ user, token, booting, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
