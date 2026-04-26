import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

const META = {
  admin:   { title: "Admin Portal",   icon: "🛡️", sub: "Manage Speak & Shine" },
  trainer: { title: "Trainer Portal", icon: "🎓", sub: "Coach your students" },
  user:    { title: "Speak & Shine",  icon: "🗣️", sub: "Track your progress" },
};

export default function Login({ loginFor = "user", showRegister = false }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const meta = META[loginFor] || META.user;

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      if (loginFor === "admin" && data.role !== "admin") { setError("Admin credentials required."); return; }
      if (loginFor === "trainer" && !["trainer","admin"].includes(data.role)) { setError("Trainer credentials required."); return; }
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      if (data.role === "admin") navigate("/admin");
      else if (data.role === "trainer") navigate("/trainer");
      else navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">{meta.icon}</div>
        <h1 className="auth-title">{meta.title}</h1>
        <p className="auth-sub">{meta.sub}</p>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input className="form-input" type="text" placeholder="e.g. 918848096746"
              value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Enter password"
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "0.25rem" }} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {showRegister && (
          <p className="auth-link">No account? <Link to="/register">Register</Link></p>
        )}

        {loginFor === "user" && (
          <div className="auth-portals">
            <Link to="/admin/login">Admin Portal →</Link>
            <Link to="/trainer/login">Trainer Portal →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
