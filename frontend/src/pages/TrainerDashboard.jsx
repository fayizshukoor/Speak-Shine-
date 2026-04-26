import { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, Cell,
} from "recharts";
import styles from "./Dashboard.module.css";

const TABS = [
  { id: "overview",    label: "📊 Overview" },
  { id: "students",    label: "👥 Students" },
  { id: "compare",     label: "⚖️ Compare" },
  { id: "improvement", label: "📈 Improvement" },
];

const SCORE_COLORS = { Fluency: "#6c63ff", Grammar: "#4ade80", Confidence: "#facc15", Vocabulary: "#ff6584" };

function avg(arr, key) {
  const vals = arr.filter(s => s[key] != null).map(s => s[key]);
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
}

function delta(arr, key) {
  if (arr.length < 2) return null;
  const first = arr[0][key];
  const last = arr[arr.length - 1][key];
  if (first == null || last == null) return null;
  return +(last - first).toFixed(1);
}

export default function TrainerDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [allScores, setAllScores] = useState({});   // phone → feedbackScores[]
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [sortBy, setSortBy] = useState("streak");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([api.get("/dashboard"), api.get("/users")])
      .then(([d, u]) => { setDashboard(d.data); setUsers(u.data); })
      .finally(() => setLoading(false));
  }, []);

  // Load all scores when switching to compare/improvement tabs
  const loadAllScores = async () => {
    if (Object.keys(allScores).length > 0) return;
    setScoresLoading(true);
    const results = {};
    await Promise.all(
      users.map(async u => {
        try {
          const { data } = await api.get(`/dashboard/scores/${u.phone}`);
          results[u.phone] = data.feedbackScores || [];
        } catch { results[u.phone] = []; }
      })
    );
    setAllScores(results);
    setScoresLoading(false);
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === "compare" || t === "improvement") loadAllScores();
  };

  const selectUser = async (user) => {
    setSelected(user);
    setTab("student-detail");
    if (!allScores[user.phone]) {
      const { data } = await api.get(`/dashboard/scores/${user.phone}`);
      setAllScores(prev => ({ ...prev, [user.phone]: data.feedbackScores || [] }));
    }
  };

  const filteredUsers = useMemo(() => {
    let list = [...users];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(u => (u.registeredName || u.name || "").toLowerCase().includes(s) || (u.phone || "").includes(s));
    }
    if (sortBy === "streak") list.sort((a, b) => (b.streak || 0) - (a.streak || 0));
    else if (sortBy === "weekly") list.sort((a, b) => (b.weeklySubmissions || 0) - (a.weeklySubmissions || 0));
    else if (sortBy === "fine") list.sort((a, b) => (b.fine || 0) - (a.fine || 0));
    else if (sortBy === "name") list.sort((a, b) => (a.registeredName || a.name || "").localeCompare(b.registeredName || b.name || ""));
    return list;
  }, [users, search, sortBy]);

  // Improvement data: first vs latest score per user
  const improvementData = useMemo(() => {
    return users.map(u => {
      const scores = allScores[u.phone] || [];
      return {
        name: (u.registeredName || u.name || u.phone || "?").slice(0, 10),
        phone: u.phone,
        sessions: scores.length,
        fluencyDelta: delta(scores, "fluency"),
        grammarDelta: delta(scores, "grammar"),
        confidenceDelta: delta(scores, "confidence"),
        vocabularyDelta: delta(scores, "vocabulary"),
        avgFluency: avg(scores, "fluency"),
        avgGrammar: avg(scores, "grammar"),
        avgConfidence: avg(scores, "confidence"),
        avgVocabulary: avg(scores, "vocabulary"),
      };
    }).filter(u => u.sessions > 0).sort((a, b) => {
      const aTotal = [a.fluencyDelta, a.grammarDelta, a.confidenceDelta, a.vocabularyDelta].filter(Boolean).reduce((s, v) => s + v, 0);
      const bTotal = [b.fluencyDelta, b.grammarDelta, b.confidenceDelta, b.vocabularyDelta].filter(Boolean).reduce((s, v) => s + v, 0);
      return bTotal - aTotal;
    });
  }, [users, allScores]);

  // Compare bar data: avg scores per user
  const compareData = useMemo(() => {
    return users.map(u => {
      const scores = allScores[u.phone] || [];
      return {
        name: (u.registeredName || u.name || u.phone || "?").slice(0, 8),
        Fluency: avg(scores, "fluency"),
        Grammar: avg(scores, "grammar"),
        Confidence: avg(scores, "confidence"),
        Vocabulary: avg(scores, "vocabulary"),
        sessions: scores.length,
      };
    }).filter(u => u.sessions > 0);
  }, [users, allScores]);

  if (loading) return <Layout title="Trainer Dashboard"><p className={styles.loading}>Loading…</p></Layout>;

  const selectedScores = selected ? (allScores[selected.phone] || []) : [];
  const chartData = selectedScores.map((s, i) => ({
    session: `#${i + 1}`,
    Fluency: s.fluency,
    Grammar: s.grammar,
    Confidence: s.confidence,
    Vocabulary: s.vocabulary,
  }));
  const latest = selectedScores.slice(-1)[0];
  const radarData = latest ? [
    { subject: "Fluency", score: latest.fluency || 0 },
    { subject: "Grammar", score: latest.grammar || 0 },
    { subject: "Confidence", score: latest.confidence || 0 },
    { subject: "Vocabulary", score: latest.vocabulary || 0 },
  ] : [];

  return (
    <Layout title="Trainer Dashboard">
      <div className={styles.grid4}>
        <StatCard icon="👥" label="Total Students" value={dashboard?.stats?.total || 0} color="#6c63ff" />
        <StatCard icon="✅" label="Submitted Today" value={dashboard?.stats?.completed || 0} color="#4ade80" />
        <StatCard icon="❌" label="Pending Today" value={dashboard?.stats?.pending || 0} color="#f87171" />
        <StatCard icon="💸" label="Total Fines" value={`₹${dashboard?.stats?.totalFines || 0}`} color="#facc15" />
      </div>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.active : ""}`} onClick={() => handleTabChange(t.id)}>
            {t.label}
          </button>
        ))}
        {selected && (
          <button className={`${styles.tab} ${tab === "student-detail" ? styles.active : ""}`} onClick={() => setTab("student-detail")}>
            📈 {(selected.registeredName || selected.name || selected.phone || "").slice(0, 12)}
          </button>
        )}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <>
          {dashboard?.today?.question && (
            <div className={styles.todayCard} style={{ marginBottom: "1.5rem" }}>
              <p className={styles.todayLabel}>📌 Today's Question</p>
              <p className={styles.todayQ}>{dashboard.today.question}</p>
              {dashboard.today.topic && <span className={styles.topic}>{dashboard.today.topic}</span>}
            </div>
          )}
          <div className={styles.grid2}>
            <div className={styles.chartCard} style={{ margin: 0 }}>
              <h3 className={styles.sectionTitle}>🏆 Top Streaks</h3>
              <div className={styles.streakList}>
                {(dashboard?.topStreak || []).map((u, i) => (
                  <div key={i} className={styles.streakRow}>
                    <span className={styles.rank}>{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                    <span className={styles.streakName}>{u.name || u.userId?.split("@")[0]}</span>
                    <span className={styles.streakVal}>🔥 {u.streak} days</span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text2)" }}>{u.weeklySubmissions}/7</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.chartCard} style={{ margin: 0 }}>
              <h3 className={styles.sectionTitle}>Today's Status</h3>
              <div className={styles.streakList}>
                {users.map((u, i) => (
                  <div key={i} className={styles.streakRow}>
                    <div className={styles.avatar} style={{ width: 28, height: 28, fontSize: "0.75rem" }}>
                      {(u.registeredName || u.name || "?")[0].toUpperCase()}
                    </div>
                    <span className={styles.streakName}>{u.registeredName || u.name || u.phone}</span>
                    <span style={{ color: u.completed ? "var(--success)" : "var(--danger)", fontSize: "0.85rem", fontWeight: 600 }}>
                      {u.completed ? "✅" : "⏳"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── STUDENTS ── */}
      {tab === "students" && (
        <>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <input className={styles.searchInput} placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className={styles.searchInput} style={{ width: "auto" }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="streak">Sort: Streak</option>
              <option value="weekly">Sort: Weekly</option>
              <option value="fine">Sort: Fine</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
          <div className={styles.grid2}>
            {filteredUsers.map(u => (
              <div key={u.userId} className={styles.userCard} onClick={() => selectUser(u)}>
                <div className={styles.avatar}>{(u.registeredName || u.name || "?")[0].toUpperCase()}</div>
                <div className={styles.userInfo}>
                  <p className={styles.userName}>{u.registeredName || u.name || u.phone}</p>
                  <p className={styles.userMeta}>
                    🔥 {u.streak || 0} streak &nbsp;·&nbsp; {u.weeklySubmissions || 0}/7 this week &nbsp;·&nbsp; ₹{u.fine || 0} fine
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                  <span style={{ color: u.completed ? "var(--success)" : "var(--danger)", fontSize: "1.1rem" }}>
                    {u.completed ? "✅" : "⏳"}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--primary)" }}>View →</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── COMPARE ── */}
      {tab === "compare" && (
        <>
          {scoresLoading ? (
            <p className={styles.loading}>Loading all scores…</p>
          ) : compareData.length === 0 ? (
            <div className={styles.emptyChart}><p>No feedback scores available yet.</p></div>
          ) : (
            <>
              {["Fluency","Grammar","Confidence","Vocabulary"].map(metric => (
                <div key={metric} className={styles.chartCard}>
                  <h3 className={styles.sectionTitle}>{metric} — All Students (avg)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={compareData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                      <XAxis dataKey="name" stroke="#9090b0" fontSize={11} />
                      <YAxis domain={[0, 10]} stroke="#9090b0" fontSize={11} />
                      <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                      <Bar dataKey={metric} fill={SCORE_COLORS[metric]} radius={[4,4,0,0]}>
                        {compareData.map((_, i) => <Cell key={i} fill={SCORE_COLORS[metric]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ── IMPROVEMENT ── */}
      {tab === "improvement" && (
        <>
          {scoresLoading ? (
            <p className={styles.loading}>Loading scores…</p>
          ) : improvementData.length === 0 ? (
            <div className={styles.emptyChart}><p>No feedback scores available yet.</p></div>
          ) : (
            <>
              <div className={styles.chartCard}>
                <h3 className={styles.sectionTitle}>Score Improvement (First → Latest session)</h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text2)", marginBottom: "1rem" }}>
                  Green = improved · Red = declined · — = only 1 session
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Student</th><th>Sessions</th>
                        <th>Fluency Δ</th><th>Grammar Δ</th><th>Confidence Δ</th><th>Vocabulary Δ</th>
                        <th>Avg Fluency</th><th>Avg Grammar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {improvementData.map((u, i) => (
                        <tr key={i} style={{ cursor: "pointer" }} onClick={() => selectUser(users.find(x => x.phone === u.phone) || {})}>
                          <td style={{ fontWeight: 500 }}>{u.name}</td>
                          <td style={{ color: "var(--text2)" }}>{u.sessions}</td>
                          {["fluencyDelta","grammarDelta","confidenceDelta","vocabularyDelta"].map(k => (
                            <td key={k} style={{ color: u[k] == null ? "var(--text2)" : u[k] > 0 ? "var(--success)" : u[k] < 0 ? "var(--danger)" : "var(--text2)", fontWeight: 600 }}>
                              {u[k] == null ? "—" : u[k] > 0 ? `+${u[k]}` : u[k]}
                            </td>
                          ))}
                          <td>{u.avgFluency ?? "—"}</td>
                          <td>{u.avgGrammar ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.sectionTitle}>Most Improved Students</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={improvementData.slice(0, 10).map(u => ({
                    name: u.name,
                    total: [u.fluencyDelta, u.grammarDelta, u.confidenceDelta, u.vocabularyDelta]
                      .filter(Boolean).reduce((s, v) => s + v, 0).toFixed(1),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                    <XAxis dataKey="name" stroke="#9090b0" fontSize={11} />
                    <YAxis stroke="#9090b0" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                    <Bar dataKey="total" name="Total Improvement" radius={[4,4,0,0]}>
                      {improvementData.slice(0, 10).map((u, i) => {
                        const total = [u.fluencyDelta, u.grammarDelta, u.confidenceDelta, u.vocabularyDelta].filter(Boolean).reduce((s, v) => s + v, 0);
                        return <Cell key={i} fill={total >= 0 ? "#4ade80" : "#f87171"} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ── STUDENT DETAIL ── */}
      {tab === "student-detail" && selected && (
        <>
          <div className={styles.grid4}>
            <StatCard icon="🔥" label="Streak" value={`${selected.streak || 0} days`} color="#f97316" />
            <StatCard icon="💸" label="Fine" value={`₹${selected.fine || 0}`} color="#f87171" />
            <StatCard icon="📹" label="Total Sessions" value={selectedScores.length} color="#6c63ff" />
            <StatCard icon="📅" label="This Week" value={`${selected.weeklySubmissions || 0}/7`} color="#4ade80" />
          </div>

          <div className={styles.grid4} style={{ marginBottom: "1.5rem" }}>
            {["fluency","grammar","confidence","vocabulary"].map(k => (
              <StatCard
                key={k}
                icon={k === "fluency" ? "🗣️" : k === "grammar" ? "📝" : k === "confidence" ? "💪" : "📚"}
                label={`Avg ${k.charAt(0).toUpperCase() + k.slice(1)}`}
                value={avg(selectedScores, k) ?? "—"}
                color={Object.values(SCORE_COLORS)[["fluency","grammar","confidence","vocabulary"].indexOf(k)]}
              />
            ))}
          </div>

          {radarData.length > 0 && (
            <div className={styles.grid2} style={{ marginBottom: "1.5rem" }}>
              <div className={styles.chartCard} style={{ margin: 0 }}>
                <h3 className={styles.sectionTitle}>Latest Session Radar</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#2a2a4a" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#9090b0", fontSize: 12 }} />
                    <Radar dataKey="score" stroke="#6c63ff" fill="#6c63ff" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className={styles.chartCard} style={{ margin: 0 }}>
                <h3 className={styles.sectionTitle}>Latest Scores</h3>
                {radarData.map(r => (
                  <div key={r.subject} style={{ marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text2)" }}>{r.subject}</span>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: r.score >= 7 ? "var(--success)" : r.score >= 5 ? "var(--warning)" : "var(--danger)" }}>
                        {r.score}/10
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div className={styles.barFill} style={{ width: `${r.score * 10}%`, background: SCORE_COLORS[r.subject] }} />
                    </div>
                  </div>
                ))}

                {selectedScores.length >= 2 && (
                  <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                    <p style={{ fontSize: "0.8rem", color: "var(--text2)", marginBottom: "0.5rem" }}>Improvement (first → latest)</p>
                    {["fluency","grammar","confidence","vocabulary"].map(k => {
                      const d = delta(selectedScores, k);
                      return (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "0.25rem" }}>
                          <span style={{ color: "var(--text2)", textTransform: "capitalize" }}>{k}</span>
                          <span style={{ fontWeight: 600, color: d == null ? "var(--text2)" : d > 0 ? "var(--success)" : d < 0 ? "var(--danger)" : "var(--text2)" }}>
                            {d == null ? "—" : d > 0 ? `+${d}` : d}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {chartData.length > 0 ? (
            <div className={styles.chartCard}>
              <h3 className={styles.sectionTitle}>Full Score History — {selected.registeredName || selected.name}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                  <XAxis dataKey="session" stroke="#9090b0" fontSize={12} />
                  <YAxis domain={[0, 10]} stroke="#9090b0" fontSize={12} />
                  <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                  <Legend />
                  {Object.entries(SCORE_COLORS).map(([key, color]) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <p>No feedback scores yet for this student.</p>
            </div>
          )}

          {selectedScores.length > 0 && (
            <div className={styles.chartCard}>
              <h3 className={styles.sectionTitle}>Session History</h3>
              <div style={{ overflowX: "auto" }}>
                <table className={styles.table}>
                  <thead><tr><th>#</th><th>Date</th><th>Fluency</th><th>Grammar</th><th>Confidence</th><th>Vocabulary</th></tr></thead>
                  <tbody>
                    {[...selectedScores].reverse().map((s, i) => (
                      <tr key={i}>
                        <td style={{ color: "var(--text2)" }}>{selectedScores.length - i}</td>
                        <td style={{ color: "var(--text2)", fontSize: "0.8rem" }}>{s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—"}</td>
                        {["fluency","grammar","confidence","vocabulary"].map(k => (
                          <td key={k} style={{ fontWeight: 600, color: (s[k] || 0) >= 7 ? "var(--success)" : (s[k] || 0) >= 5 ? "var(--warning)" : "var(--danger)" }}>
                            {s[k] ?? "—"}/10
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
