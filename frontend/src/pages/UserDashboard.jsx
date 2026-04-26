import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import styles from "./Dashboard.module.css";

export default function UserDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/me")
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || "Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <Layout title="My Dashboard">
      <div className={styles.loadingBox}>
        <div className={styles.spinner} />
        <p>Loading your data…</p>
      </div>
    </Layout>
  );

  if (error) return (
    <Layout title="My Dashboard">
      <div className={styles.errorBox}>
        <p>⚠️ {error}</p>
        <button className={styles.retryBtn} onClick={() => window.location.reload()}>Retry</button>
      </div>
    </Layout>
  );

  const profile = data?.profile;
  const scores = profile?.feedbackScores || [];

  const chartData = scores.map((s, i) => ({
    session: `#${i + 1}`,
    Fluency: s.fluency,
    Grammar: s.grammar,
    Confidence: s.confidence,
    Vocabulary: s.vocabulary,
  }));

  const latest = scores.slice(-1)[0];
  const radarData = latest ? [
    { subject: "Fluency",    score: latest.fluency    || 0 },
    { subject: "Grammar",    score: latest.grammar    || 0 },
    { subject: "Confidence", score: latest.confidence || 0 },
    { subject: "Vocabulary", score: latest.vocabulary || 0 },
  ] : [];

  const avg = (key) => {
    const vals = scores.filter(s => s[key] != null).map(s => s[key]);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
  };

  return (
    <Layout title="My Dashboard">

      {/* Today's question */}
      {data?.today?.question && (
        <div className={styles.todayCard}>
          <p className={styles.todayLabel}>📌 Today's Question</p>
          <p className={styles.todayQ}>{data.today.question}</p>
          {data.today.topic && <span className={styles.topic}>{data.today.topic}</span>}
        </div>
      )}

      {/* Not linked to WhatsApp yet */}
      {!profile && (
        <div className={styles.warnBox}>
          <p>⚠️ Your account isn't linked to a WhatsApp submission yet.</p>
          <p style={{ fontSize: "0.82rem", marginTop: "0.4rem", color: "var(--text2)" }}>
            Make sure you registered with the same phone number you use on WhatsApp in the group.
            Once you submit a video, your data will appear here.
          </p>
        </div>
      )}

      {/* Personal stats */}
      <div className={styles.grid4}>
        <StatCard icon="🔥" label="Current Streak"    value={`${profile?.streak || 0} days`}           color="#f97316" />
        <StatCard icon="💸" label="Total Fine"         value={`₹${profile?.fine || 0}`}                 color="#f87171" />
        <StatCard icon="📹" label="Total Sessions"     value={scores.length}                             color="#6c63ff" />
        <StatCard icon="📅" label="This Week"          value={`${profile?.weeklySubmissions || 0}/7`}    color="#4ade80" />
      </div>

      {/* Group stats */}
      <div className={styles.grid4}>
        <StatCard icon="👥" label="Group Members"      value={data?.stats?.total || 0}                  color="#6c63ff" />
        <StatCard icon="✅" label="Submitted Today"    value={data?.stats?.completed || 0}              color="#4ade80" />
        <StatCard icon="⏳" label="Pending Today"      value={data?.stats?.pending || 0}                color="#f87171" />
        <StatCard icon="📆" label="Monthly Submissions" value={profile?.monthlySubmissions || 0}        color="#facc15" />
      </div>

      {/* Today's submission status */}
      {profile && (
        <div className={styles.submissionStatus} data-done={profile.completed}>
          {profile.completed
            ? "✅ You've submitted today — great work!"
            : "⏳ You haven't submitted today yet. Send your video on WhatsApp!"}
        </div>
      )}

      {scores.length > 0 ? (
        <>
          {/* Avg score cards */}
          <div className={styles.grid4}>
            <StatCard icon="🗣️" label="Avg Fluency"    value={avg("fluency")}    color="#6c63ff" />
            <StatCard icon="📝" label="Avg Grammar"    value={avg("grammar")}    color="#4ade80" />
            <StatCard icon="💪" label="Avg Confidence" value={avg("confidence")} color="#facc15" />
            <StatCard icon="📚" label="Avg Vocabulary" value={avg("vocabulary")} color="#ff6584" />
          </div>

          <div className={styles.grid2}>
            {/* Radar — latest session */}
            <div className={styles.chartCard} style={{ margin: 0 }}>
              <h3 className={styles.sectionTitle}>Latest Session</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#2a2a4a" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#9090b0", fontSize: 12 }} />
                  <Radar dataKey="score" stroke="#6c63ff" fill="#6c63ff" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Score bars */}
            <div className={styles.chartCard} style={{ margin: 0 }}>
              <h3 className={styles.sectionTitle}>Latest Scores</h3>
              {radarData.map(r => (
                <div key={r.subject} style={{ marginBottom: "0.85rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--text2)" }}>{r.subject}</span>
                    <span style={{
                      fontSize: "0.85rem", fontWeight: 700,
                      color: r.score >= 7 ? "var(--success)" : r.score >= 5 ? "var(--warning)" : "var(--danger)"
                    }}>{r.score}/10</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${r.score * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Score history line chart */}
          <div className={styles.chartCard}>
            <h3 className={styles.sectionTitle}>My Score History ({scores.length} sessions)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                <XAxis dataKey="session" stroke="#9090b0" fontSize={12} />
                <YAxis domain={[0, 10]} stroke="#9090b0" fontSize={12} />
                <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="Fluency"    stroke="#6c63ff" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Grammar"    stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Confidence" stroke="#facc15" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Vocabulary" stroke="#ff6584" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Session history table */}
          <div className={styles.chartCard}>
            <h3 className={styles.sectionTitle}>Session History</h3>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr><th>#</th><th>Date</th><th>Fluency</th><th>Grammar</th><th>Confidence</th><th>Vocabulary</th></tr>
                </thead>
                <tbody>
                  {[...scores].reverse().map((s, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--text2)" }}>{scores.length - i}</td>
                      <td style={{ color: "var(--text2)", fontSize: "0.8rem" }}>
                        {s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—"}
                      </td>
                      {["fluency","grammar","confidence","vocabulary"].map(k => (
                        <td key={k} style={{ fontWeight: 600, color: (s[k]||0) >= 7 ? "var(--success)" : (s[k]||0) >= 5 ? "var(--warning)" : "var(--danger)" }}>
                          {s[k] ?? "—"}/10
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.emptyChart}>
          <p>📹 No feedback scores yet. Submit a video via WhatsApp to get started!</p>
        </div>
      )}

      {/* Top streaks */}
      {data?.topStreak?.length > 0 && (
        <div className={styles.chartCard}>
          <h3 className={styles.sectionTitle}>🏆 Top Streaks</h3>
          <div className={styles.streakList}>
            {data.topStreak.map((u, i) => (
              <div key={i} className={styles.streakRow}>
                <span className={styles.rank}>{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                <span className={styles.streakName}>{u.name || u.userId?.split("@")[0]}</span>
                <span className={styles.streakVal}>🔥 {u.streak} days</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text2)" }}>{u.weeklySubmissions}/7</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
