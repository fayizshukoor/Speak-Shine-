import axios from "axios";

// Dev: set VITE_API_URL=http://localhost:3001/api in frontend/.env.local
// Production (Railway): API and frontend are on the same origin, so /api works
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
