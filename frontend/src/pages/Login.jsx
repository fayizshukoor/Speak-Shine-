import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";
import styles from "./Auth.module.css";

const META = {
  admin:   { title: "Admin Portal",   icon: "🛡️", sub: "Sign in to manage Speak & Shine" },
  trainer: { title: "Trainer Portal", icon: "🎓", sub: "Sign in to coach your students" },
  user:    { title: "Speak & Shine",  icon: "🗣️", sub: "Sign in to your account" },
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
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);

      // Role gate — make sure the right person is logging into the right portal
      if (loginFor === "admin" && data.role !== "admin") {
        setError("Access denied. Admin credentials required.");
        setLoading(false);
        return;
      }
      if (loginFor === "trainer" && !["trainer", "admin"].includes(data.role)) {
        setError("Access denied. Trainer credentials required.");
        setLoading(false);
        return;
      }

      login(data.token, { phone: data.phone, role: data.role, name: data.name });

      // Redirect to the correct page
      if (data.role === "admin") navigate("/admin");
      else if (data.role === "trainer") navigate("/trainer");
      else navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>{meta.icon}</div>
        <h1 className={styles.title}>{meta.title}</h1>
        <p className={styles.sub}>{meta.sub}</p>

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label>Phone Number</label>
            <input
              type="text"
              placeholder="e.g. 918848096746"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Only show register link on the user login page */}
        {showRegister && (
          <p className={styles.link}>
            Don't have an account? <Link to="/register">Register</Link>
          </p>
        )}

        {/* Portal switcher hints */}
        {loginFor === "user" && (
          <div className={styles.portalLinks}>
            <Link to="/admin/login">Admin Portal →</Link>
            <Link to="/trainer/login">Trainer Portal →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
