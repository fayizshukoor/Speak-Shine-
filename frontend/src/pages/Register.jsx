import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🗣️</div>
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-sub">Join Speak & Shine</p>

        <form onSubmit={submit}>
          {[
            { key: "name",     label: "Full Name",    type: "text",     ph: "Your name" },
            { key: "phone",    label: "Phone Number", type: "text",     ph: "e.g. 918848096746" },
            { key: "password", label: "Password",     type: "password", ph: "Create a password" },
          ].map(f => (
            <div className="form-group" key={f.key}>
              <label className="form-label">{f.label}</label>
              <input className="form-input" type={f.type} placeholder={f.ph}
                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required />
            </div>
          ))}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "0.25rem" }} disabled={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="auth-link">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
