import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";
import styles from "./Auth.module.css";

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🗣️</div>
        <h1 className={styles.title}>Speak & Shine</h1>
        <p className={styles.sub}>Create your account</p>
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label>Full Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
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
              placeholder="Create a password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <p className={styles.link}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
