/**
 * PaymentHistory
 * Shows the logged-in user's payment transactions and current access status.
 */

import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";

function statusBadge(status) {
  const map = {
    success:  { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.3)",  label: "✅ Success" },
    failed:   { color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)", label: "❌ Failed" },
    manual:   { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",  label: "🔧 Manual" },
    refunded: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)",  border: "rgba(56,189,248,0.3)",  label: "↩️ Refunded" },
  };
  const s = map[status] || map.failed;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 8, padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 700,
    }}>
      {s.label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PaymentHistory() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/payments/my-transactions")
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.error || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout title="Payment History"><div className="spinner-wrap"><div className="spinner" /></div></Layout>;
  if (error)   return <Layout title="Payment History"><div className="error-box"><p>{error}</p></div></Layout>;

  const { transactions = [], paid, paidAt, paymentId } = data;

  return (
    <Layout title="Payment History">
      <div style={{ maxWidth: 680, margin: "1.5rem auto", padding: "0 1rem" }}>

        {/* Access Status Card */}
        <div style={{
          background: paid
            ? "linear-gradient(135deg, #0a2e1a 0%, #0d3d22 100%)"
            : "linear-gradient(135deg, #2e0a0a 0%, #3d0d0d 100%)",
          border: `1px solid ${paid ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
          borderRadius: 16, padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem",
          display: "flex", alignItems: "center", gap: "1rem",
        }}>
          <div style={{ fontSize: "2.5rem" }}>{paid ? "✅" : "🔒"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", marginBottom: "0.2rem" }}>
              {paid ? "Access Active" : "Access Locked"}
            </div>
            <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.6)" }}>
              {paid
                ? `Paid on ${formatDate(paidAt)}${paymentId ? ` · ID: ${paymentId.slice(-10)}` : ""}`
                : "Complete payment to unlock all features"}
            </div>
          </div>
          <div style={{
            background: paid ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
            color: paid ? "#4ade80" : "#f87171",
            border: `1px solid ${paid ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            borderRadius: 10, padding: "0.4rem 0.9rem",
            fontSize: "0.78rem", fontWeight: 700,
          }}>
            {paid ? "ACTIVE" : "INACTIVE"}
          </div>
        </div>

        {/* Transaction Table */}
        <div style={{
          background: "var(--bg-card, #10101e)",
          border: "1px solid var(--border, #1e1e3a)",
          borderRadius: 16, overflow: "hidden",
        }}>
          <div style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border, #1e1e3a)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
              💳 Transaction History
            </div>
            <div style={{
              fontSize: "0.72rem", color: "var(--muted)",
              background: "rgba(124,111,255,0.1)", borderRadius: 8,
              padding: "0.2rem 0.6rem", border: "1px solid rgba(124,111,255,0.2)",
            }}>
              {transactions.length} record{transactions.length !== 1 ? "s" : ""}
            </div>
          </div>

          {transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)", fontSize: "0.9rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📭</div>
              No transactions yet
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border, #1e1e3a)" }}>
                    {["Date", "Amount", "Status", "Payment ID"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "0.7rem 1rem",
                        color: "var(--muted)", fontWeight: 600,
                        fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => (
                    <tr key={tx._id || i} style={{
                      borderBottom: "1px solid var(--border, #1e1e3a)",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    }}>
                      <td style={{ padding: "0.75rem 1rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDate(tx.createdAt)}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text)" }}>
                        {tx.amount > 0 ? `₹${tx.amount}` : tx.source === "admin" ? "—" : "₹0"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {statusBadge(tx.status)}
                        {tx.note && (
                          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                            {tx.note}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "var(--muted)", fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {tx.razorpayPaymentId
                          ? <span title={tx.razorpayPaymentId}>{tx.razorpayPaymentId.slice(-12)}</span>
                          : tx.source === "admin" ? "Admin" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted)", marginTop: "1.25rem" }}>
          For refunds or issues, contact your trainer or admin.
        </p>
      </div>
    </Layout>
  );
}
