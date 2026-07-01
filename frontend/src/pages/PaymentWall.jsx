/**
 * PaymentWall
 * Shown to unpaid users when they try to access a gated feature.
 * Handles Razorpay Standard Checkout flow end-to-end.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// ── Load Razorpay checkout.js script once ────────────────────────────────────
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const PLAN_AMOUNT = 5; // INR

export default function PaymentWall({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(false);
  const navigate = useNavigate();
  const { login, user } = useAuth();

  // After successful payment — update auth context then hard-reload
  // so PaidRoute re-evaluates with paid=true from the fresh session
  useEffect(() => {
    if (paid) {
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          // Update user in memory so PaidRoute unblocks immediately,
          // then hard-navigate to flush any cached state
          if (user) {
            login({ ...user, paid: true });
          }
          // Hard reload to /video-analysis — forces fresh AuthContext boot
          window.location.href = "/video-analysis";
        }
      }, 1800);
    }
  }, [paid, navigate, onSuccess, login, user]);

  const handlePay = async () => {
    setError(null);
    setLoading(true);

    // 1. Load Razorpay checkout SDK
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setError("Payment system failed to load. Please check your internet connection and try again.");
      setLoading(false);
      return;
    }

    try {
      // 2. Create order on backend
      const { data: order } = await api.post("/payments/create-order", {
        amount: PLAN_AMOUNT,
      });

      // 3. Open Razorpay modal
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "Speak & Shine",
        description: "Premium Membership",
        image: "/icons/icon-192.png",
        order_id: order.order_id,
        handler: async (response) => {
          // 4. Verify payment on backend
          try {
            await api.post("/payments/verify", {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
            });
            setPaid(true);
          } catch (verifyErr) {
            setError(
              verifyErr?.response?.data?.error ||
              "Payment verification failed. Please contact support."
            );
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            setError("Payment cancelled. You can try again anytime.");
          },
        },
        prefill: {
          name: "",
          contact: "",
        },
        theme: { color: "#7c6fff" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        setLoading(false);
        setError(
          response.error?.description ||
          "Payment failed. Please try a different payment method."
        );
      });
      rzp.open();
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        "Could not initiate payment. Please try again."
      );
      setLoading(false);
    }
  };

  if (paid) {
    return (
      <Layout title="Payment Successful">
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "60vh", textAlign: "center",
          padding: "2rem",
        }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
          <h2 style={{ color: "#4ade80", fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            Payment Successful!
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
            Your account is now active. Redirecting you…
          </p>
          <div className="spinner" style={{ marginTop: "1.5rem" }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Unlock Full Access">
      <div style={{
        maxWidth: 480, margin: "2rem auto", padding: "0 1rem",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%)",
          border: "1px solid rgba(124,111,255,0.3)",
          borderRadius: 20,
          padding: "2rem 1.5rem",
          textAlign: "center",
          marginBottom: "1.5rem",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: -50, right: -50,
            width: 180, height: 180, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,111,255,0.2) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🔒</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", marginBottom: "0.5rem" }}>
            Payment Required
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Your account is on a payment hold. Complete the payment below to unlock
            video submission, analysis, and all premium features.
          </p>
        </div>

        {/* Plan card */}
        <div style={{
          background: "rgba(124,111,255,0.06)",
          border: "2px solid rgba(124,111,255,0.3)",
          borderRadius: 16,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: "1rem",
          }}>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#a78bfa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.25rem" }}>
                Premium Membership
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)" }}>
                Speak &amp; Shine Full Access
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#7c6fff" }}>
                ₹{PLAN_AMOUNT}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>one-time</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              "📹 Daily video submission & AI analysis",
              "📊 Fluency, grammar & confidence scores",
              "🔥 Streak tracking & leaderboard",
              "💬 Community feed & live sessions",
              "🎓 Vocabulary challenges & feedback",
            ].map((item) => (
              <div key={item} style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                fontSize: "0.85rem", color: "var(--text)",
              }}>
                <span style={{ color: "#4ade80", flexShrink: 0 }}>✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: 10,
            padding: "0.85rem 1rem",
            marginBottom: "1rem",
            color: "#f87171",
            fontSize: "0.85rem",
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Pay button */}
        <button
          onClick={handlePay}
          disabled={loading}
          style={{
            width: "100%",
            background: loading
              ? "rgba(124,111,255,0.4)"
              : "linear-gradient(135deg, #7c6fff 0%, #6d5ce7 100%)",
            color: "#fff",
            border: "none",
            borderRadius: 14,
            padding: "1rem 1.5rem",
            fontSize: "1.05rem",
            fontWeight: 800,
            cursor: loading ? "not-allowed" : "pointer",
            letterSpacing: "0.03em",
            boxShadow: loading ? "none" : "0 6px 24px rgba(124,111,255,0.35)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 10px 30px rgba(124,111,255,0.45)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(124,111,255,0.35)";
          }}
        >
          {loading ? "Processing…" : `💳 Pay ₹${PLAN_AMOUNT} & Unlock Access`}
        </button>

        <p style={{
          textAlign: "center",
          fontSize: "0.75rem",
          color: "var(--muted)",
          marginTop: "1rem",
          lineHeight: 1.6,
        }}>
          Secured by Razorpay · UPI, cards, netbanking accepted<br />
          Contact your trainer if you believe this is a mistake.
        </p>
      </div>
    </Layout>
  );
}
