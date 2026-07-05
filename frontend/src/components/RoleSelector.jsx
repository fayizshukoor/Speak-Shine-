import { useState } from "react";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function RoleSelector({ phone, currentRole, onRoleChange }) {
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const { user: currentUser } = useAuth();

  // admins-tier: cannot touch admin or admins accounts, cannot assign admin/admins
  const isAdminsTier = currentUser?.role === "admins";
  const targetIsAdminLevel = role === "admin" || role === "admins";
  const locked = isAdminsTier && targetIsAdminLevel;

  const changeRole = async (newRole) => {
    if (newRole === role) return;
    const previousRole = role;
    setRole(newRole);
    setLoading(true);
    try {
      await api.patch(`/users/${phone}/role`, { role: newRole });
      toast(`Role changed to ${newRole}`);
      if (onRoleChange) onRoleChange(phone, newRole);
    } catch (err) {
      setRole(previousRole);
      toast(err.response?.data?.error || "Failed to change role", "error");
    } finally {
      setLoading(false);
    }
  };

  if (locked) {
    // admins-tier user viewing an admin-level account — read-only badge
    return (
      <span style={{
        background: "rgba(124,111,255,0.15)",
        border: "1px solid rgba(124,111,255,0.3)",
        color: "#a78bfa",
        borderRadius: 8,
        padding: "0.2rem 0.6rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        cursor: "not-allowed",
        userSelect: "none",
      }}>
        🔒 {role}
      </span>
    );
  }

  return (
    <select
      value={role}
      onChange={(e) => changeRole(e.target.value)}
      disabled={loading}
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        color: loading ? "var(--muted)" : "var(--text)",
        borderRadius: 8,
        padding: "0.2rem 0.4rem",
        fontSize: "0.75rem",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
    >
      <option value="user">User</option>
      <option value="trainer">Trainer</option>
      <option value="viewer">Viewer</option>
      {/* admins-tier cannot assign admin-level roles */}
      {!isAdminsTier && <option value="admins">Admins</option>}
      {!isAdminsTier && <option value="admin">Admin</option>}
    </select>
  );
}
