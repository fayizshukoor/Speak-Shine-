import axios from "axios";
import { reconnectSocketWithNewToken } from "../hooks/useSocket";

// Dev: set VITE_API_URL=http://localhost:3001/api in frontend/.env.local
// Production (Railway): API and frontend are on the same origin, so /api works
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: BASE_URL });

// Simple in-memory GET cache — avoids duplicate requests within 30s
const cache = new Map();
const CACHE_TTL = 30_000;
const CACHEABLE = ["/dashboard", "/dashboard/me", "/users", "/questions", "/live-sessions"];

// Track if we're currently refreshing to avoid multiple refresh calls
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) {
    throw new Error("No refresh token");
  }

  try {
    const response = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
    const { accessToken, refreshToken: newRefreshToken } = response.data;
    
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", newRefreshToken);
    
    // Reconnect socket with the new token so chat doesn't need a hard reload
    try { reconnectSocketWithNewToken(accessToken); } catch {}
    
    return accessToken;
  } catch (error) {
    // Refresh failed, logout user
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/login";
    throw error;
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Serve from cache for GET requests on cacheable endpoints
  if (config.method === "get") {
    const key = config.url + JSON.stringify(config.params || {});
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL && CACHEABLE.some(p => config.url.startsWith(p))) {
      config._cached = hit.data;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    // Store GET responses in cache
    if (res.config.method === "get") {
      const key = res.config.url + JSON.stringify(res.config.params || {});
      if (CACHEABLE.some(p => res.config.url.startsWith(p))) {
        cache.set(key, { data: res, ts: Date.now() });
      }
    }
    return res;
  },
  async (err) => {
    const originalRequest = err.config;

    // If token expired and we haven't tried refreshing yet
    if (err.response?.status === 401 && 
        err.response?.data?.code === "TOKEN_EXPIRED" && 
        !originalRequest._retry) {
      
      if (isRefreshing) {
        // Wait for the ongoing refresh to complete
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        onTokenRefreshed(newToken);
        
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        return Promise.reject(refreshError);
      }
    }

    // Other 401 errors (invalid token, etc.) - logout
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }

    // Account disabled by admin — force logout immediately
    if (err.response?.status === 403 && err.response?.data?.code === "ACCOUNT_DISABLED") {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "/login?reason=disabled";
    }
    
    return Promise.reject(err);
  }
);

// Refresh proactively if the access token expires within this window
const EXP_SKEW_MS = 60_000;

// Decode the `exp` claim (ms) from a JWT without verifying the signature
function getTokenExpMs(token) {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Proactively ensure a valid access token before firing app requests.
 * Refreshes when the stored token is expired or about to expire, so we
 * avoid the 401 burst + socket-with-dead-token churn on boot.
 * Coordinates with the response interceptor via the shared isRefreshing lock.
 * Returns the usable token, or null if no session.
 */
export async function ensureFreshToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;

  const expMs = getTokenExpMs(token);
  // No exp claim — can't judge; let the interceptor handle any 401
  if (expMs == null) return token;
  // Still comfortably valid
  if (expMs - Date.now() > EXP_SKEW_MS) return token;

  // Expired / near expiry — refresh now
  if (isRefreshing) {
    return new Promise((resolve) => subscribeTokenRefresh(resolve));
  }
  if (!localStorage.getItem("refreshToken")) return token;

  isRefreshing = true;
  try {
    const newToken = await refreshAccessToken();
    isRefreshing = false;
    onTokenRefreshed(newToken);
    return newToken;
  } catch {
    isRefreshing = false;
    // refreshAccessToken already cleared session + redirected to /login
    return null;
  }
}

// Call this after any mutation to bust stale cache entries
export function bustCache(urlPrefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(urlPrefix)) cache.delete(key);
  }
}

export default api;
