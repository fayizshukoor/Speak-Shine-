import axios from "axios";

// Dev: set VITE_API_URL=http://localhost:3001/api in frontend/.env.local
// Production (Railway): API and frontend are on the same origin, so /api works
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: BASE_URL });

// Simple in-memory GET cache — avoids duplicate requests within 30s
const cache = new Map();
const CACHE_TTL = 30_000;
const CACHEABLE = ["/dashboard", "/dashboard/me", "/users", "/questions", "/live-sessions"];

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
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Call this after any mutation to bust stale cache entries
export function bustCache(urlPrefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(urlPrefix)) cache.delete(key);
  }
}

export default api;
