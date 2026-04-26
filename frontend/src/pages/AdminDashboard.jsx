import { useEffect, useState, useMemo } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend,
} from "recharts";
import styles from "./Dashboard.module.css";

const CATEGORIES = ["Daily Life","Opinion","Personal Experience","English Growth","Future Goals","Fun Topic","Free Talk"];
const TABS = [
  { id: "overview",   label: "📊 Overview" },
  { id: "today",      label: "📅 Today" },
  { id: "users",      label: "👥 Users" },
  { id: "reports",    label: "📈 Reports" },
  { id: "fines",      label: "💸 Fines" },
  { id: "questions",  label: "❓ Questions" },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [qForm, setQForm] = useState({ category: "", topic: "", question: "" });
  const [editQ, setEditQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: "", type: "success" });
  const [search, setSearch] = useState("");
  const [qSearch, setQSearch] = useState("");
  const [qCatFilter, setQCatFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [d, u, q, w, m] = await Promise.all([
        api.get("/dashboard"),
        api.get("/users"),
        api.get("/questions?limit=200"),
        api.get("/dashboard/report/weekly"),
        api.get("/dashboard/report/monthly"),
      ]);
      setDashboard(d.data);
      setUsers(u.data);
      setQuestions(q.data.questions);
      setWeekly(w.data);
      setMonthly(m.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const flash = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "success" }), 3000);
  };

  const changeRole = async (phone, role) => {
    await api.patch(`/users/${phone}/role`, { role });
    flash(`Role updated to ${role}`);
    load();
  };

  const toggleUser = async (phone) => {
    await api.patch(`/users/${phone}/toggle`);
    flash("User status toggled");
    load();
  };

  const deleteUser = async (phone) => {
    if (!confirm("Remove this user from the webapp?")) return;
    await api.delete(`/users/${phone}`);
    flash("User removed");
    load();
  };

  const adjustFine = async (phone, current) => {
    const val = prompt(`Enter fine adjustment (negative to deduct). Current: ₹${current}`, "0");
    if (val === null || isNaN(Number(val))) return;
    await api.patch(`/users/${phone}/fine`, { amount: Number(val) });
    flash(`Fine adjusted by ₹${val}`);
    load();
  };

  const resetFine = async (phone) => {
    if (!confirm("Reset this user's fine to ₹0?")) return;
    const user = users.find(u => u.phone === phone);
    if (!user) return;
    await api.patch(`/users/${phone}/fine`, { amount: -(user.fine || 0) });
    flash("Fine reset to ₹0");
    load();
  };

  const addQuestion = async (e) => {
    e.preventDefault();
    if (editQ) {
      await api.patch(`/questions/${editQ._id}`, qForm);
      setEditQ(null);
      flash("Question updated!");
    } else {
      await api.post("/questions", qForm);
      flash("Question added!");
    }
    setQForm({ category: "", topic: "", question: "" });
    load();
  };

  const deleteQuestion = async (id) => {
    if (!confirm("Delete this question?")) return;
    await api.delete(`/questions/${id}`);
    flash("Question deleted", "danger");
    load();
  };

  const startEdit = (q) => {
    setEditQ(q);
    setQForm({ category: q.category, topic: q.topic, question: q.question });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filteredUsers = useMemo(() =>
    users.filter(u => {
      const name = (u.registeredName || u.name || "").toLowerCase();
      const phone = (u.phone || "").toLowerCase();
      return name.includes(search.toLowerCase()) || phone.includes(search.toLowerCase());
    }), [users, search]);

  const filteredQuestions = useMemo(() =>
    questions.filter(q => {
      const matchCat = qCatFilter ? q.category === qCatFilter : true;
      const matchSearch = q.question.toLowerCase().includes(qSearch.toLowerCase()) ||
        q.topic.toLowerCase().includes(qSearch.toLowerCase());
      return matchCat && matchSearch;
    }), [questions, qSearch, qCatFilter]);

  // Chart data
  const submissionPieData = [
    { name: "Submitted", value: dashboard?.stats?.completed || 0, color: "#4ade80" },
    { name: "Pending", value: dashboard?.stats?.pending || 0, color: "#f87171" },
  ];

  const weeklyBarData = weekly.slice(0, 10).map(u => ({
    name: (u.name || u.userId?.split("@")[0] || "?").slice(0, 8),
    days: u.weeklySubmissions || 0,
    streak: u.streak || 0,
  }));

  const fineBarData = [...users]
    .filter(u => (u.fine || 0) > 0)
    .sort((a, b) => (b.fine || 0) - (a.fine || 0))
    .slice(0, 10)
    .map(u => ({
      name: (u.registeredName || u.name || u.phone || "?").slice(0, 8),
      fine: u.fine || 0,
    }));

  const catCount = questions.reduce((acc, q) => {
    acc[q.category] = (acc[q.category] || 0) + 1;
    return acc;
  }, {});
  const catPieData = Object.entries(catCount).map(([name, value]) => ({ name, value }));
  const PIE_COLORS = ["#6c63ff","#4ade80","#facc15","#ff6584","#38bdf8","#fb923c","#a78bfa"];

  if (loading) return <Layout title="Admin Dashboard"><p className={styles.loading}>Loading…</p></Layout>;

  return (
    <Layout title="Admin Dashboard">
      {msg.text && (
        <div className={styles.flashMsg} data-type={msg.type}>{msg.text}</div>
      )}

      <div className={styles.grid4}>
        <StatCard icon="👥" label="Total Users" value={dashboard?.stats?.total || 0} color="#6c63ff" />
        <StatCard icon="✅" label="Submitted Today" value={dashboard?.stats?.completed || 0} color="#4ade80" />
        <StatCard icon="❌" label="Pending Today" value={dashboard?.stats?.pending || 0} color="#f87171" />
        <StatCard icon="💸" label="Total Fines" value={`₹${dashboard?.stats?.totalFines || 0}`} color="#facc15" />
      </div>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.active : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className={styles.grid2}>
          <div className={styles.chartCard} style={{ margin: 0 }}>
            <h3 className={styles.sectionTitle}>Today's Submission Rate</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={submissionPieData} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                  {submissionPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

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
            <h3 className={styles.sectionTitle}>Weekly Submissions (Top 10)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                <XAxis dataKey="name" stroke="#9090b0" fontSize={11} />
                <YAxis domain={[0, 7]} stroke="#9090b0" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                <Bar dataKey="days" fill="#6c63ff" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.chartCard} style={{ margin: 0 }}>
            <h3 className={styles.sectionTitle}>Question Bank by Category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={catPieData} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${value}`}>
                  {catPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "0.75rem" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── TODAY ── */}
      {tab === "today" && (
        <>
          {dashboard?.today?.question ? (
            <div className={styles.todayCard} style={{ marginBottom: "1.5rem" }}>
              <p className={styles.todayLabel}>📌 Today's Question</p>
              <p className={styles.todayQ}>{dashboard.today.question}</p>
              {dashboard.today.topic && <span className={styles.topic}>{dashboard.today.topic}</span>}
            </div>
          ) : (
            <div className={styles.emptyChart} style={{ marginBottom: "1.5rem" }}>
              <p>⏳ No question sent today yet.</p>
            </div>
          )}

          <div className={styles.chartCard}>
            <h3 className={styles.sectionTitle}>Today's Submission Status</h3>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Name</th><th>Phone</th><th>Streak</th><th>Status</th><th>Fine</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.userId}>
                      <td>{u.registeredName || u.name || "—"}</td>
                      <td style={{ color: "var(--text2)", fontSize: "0.8rem" }}>{u.phone}</td>
                      <td>🔥 {u.streak || 0}</td>
                      <td>
                        <span style={{ color: u.completed ? "var(--success)" : "var(--danger)", fontWeight: 600, fontSize: "0.85rem" }}>
                          {u.completed ? "✅ Submitted" : "⏳ Pending"}
                        </span>
                      </td>
                      <td style={{ color: u.fine > 0 ? "var(--danger)" : "var(--text2)" }}>₹{u.fine || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── USERS ── */}
      {tab === "users" && (
        <div className={styles.chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>All Users ({filteredUsers.length})</h3>
            <input
              className={styles.searchInput}
              placeholder="Search by name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th><th>Phone</th><th>Role</th><th>Streak</th>
                  <th>Weekly</th><th>Monthly</th><th>Fine</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.userId}>
                    <td style={{ fontWeight: 500 }}>{u.registeredName || u.name || "—"}</td>
                    <td style={{ color: "var(--text2)", fontSize: "0.8rem" }}>{u.phone}</td>
                    <td>
                      <select
                        className={styles.roleSelect}
                        value={u.role || "user"}
                        onChange={e => changeRole(u.phone, e.target.value)}
                      >
                        <option value="user">user</option>
                        <option value="trainer">trainer</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>🔥 {u.streak || 0}</td>
                    <td>{u.weeklySubmissions || 0}/7</td>
                    <td>{u.monthlySubmissions || 0}</td>
                    <td style={{ color: u.fine > 0 ? "var(--danger)" : "var(--text2)" }}>₹{u.fine || 0}</td>
                    <td>
                      <span style={{ color: u.isActive ? "var(--success)" : "var(--danger)", fontSize: "0.8rem" }}>
                        {u.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className={styles.actionBtn} onClick={() => adjustFine(u.phone, u.fine)}>±Fine</button>
                      <button className={styles.actionBtn} onClick={() => resetFine(u.phone)}>Reset Fine</button>
                      <button className={styles.actionBtn} onClick={() => toggleUser(u.phone)}>
                        {u.isActive ? "Disable" : "Enable"}
                      </button>
                      <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => deleteUser(u.phone)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── REPORTS ── */}
      {tab === "reports" && (
        <>
          <div className={styles.chartCard}>
            <h3 className={styles.sectionTitle}>📅 Weekly Report</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekly.slice(0, 15).map(u => ({
                name: (u.name || u.userId?.split("@")[0] || "?").slice(0, 8),
                days: u.weeklySubmissions || 0,
                streak: u.streak || 0,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                <XAxis dataKey="name" stroke="#9090b0" fontSize={11} />
                <YAxis domain={[0, 7]} stroke="#9090b0" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="days" name="Days Submitted" fill="#6c63ff" radius={[4,4,0,0]} />
                <Bar dataKey="streak" name="Streak" fill="#facc15" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ overflowX: "auto", marginTop: "1rem" }}>
              <table className={styles.table}>
                <thead><tr><th>#</th><th>Name</th><th>Days</th><th>Streak</th><th>Weekly Fine</th></tr></thead>
                <tbody>
                  {weekly.map((u, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--text2)" }}>{i + 1}</td>
                      <td>{u.name || u.userId?.split("@")[0]}</td>
                      <td><span style={{ color: u.weeklySubmissions >= 7 ? "var(--success)" : u.weeklySubmissions >= 4 ? "var(--warning)" : "var(--danger)" }}>{u.weeklySubmissions || 0}/7</span></td>
                      <td>🔥 {u.streak || 0}</td>
                      <td style={{ color: "var(--danger)" }}>₹{u.weeklyFine || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.chartCard}>
            <h3 className={styles.sectionTitle}>📆 Monthly Report</h3>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead><tr><th>#</th><th>Name</th><th>Monthly Submissions</th><th>Streak</th><th>Total Fine</th></tr></thead>
                <tbody>
                  {monthly.map((u, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--text2)" }}>{i + 1}</td>
                      <td>{u.name || u.userId?.split("@")[0]}</td>
                      <td>{u.monthlySubmissions || 0}</td>
                      <td>🔥 {u.streak || 0}</td>
                      <td style={{ color: u.fine > 0 ? "var(--danger)" : "var(--text2)" }}>₹{u.fine || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── FINES ── */}
      {tab === "fines" && (
        <>
          <div className={styles.grid4} style={{ marginBottom: "1.5rem" }}>
            <StatCard icon="💸" label="Total Outstanding" value={`₹${users.reduce((s, u) => s + (u.fine || 0), 0)}`} color="#f87171" />
            <StatCard icon="⚠️" label="Users with Fines" value={users.filter(u => (u.fine || 0) > 0).length} color="#facc15" />
            <StatCard icon="✅" label="Fine-Free Users" value={users.filter(u => (u.fine || 0) === 0).length} color="#4ade80" />
            <StatCard icon="📊" label="Avg Fine" value={`₹${users.length ? Math.round(users.reduce((s, u) => s + (u.fine || 0), 0) / users.length) : 0}`} color="#6c63ff" />
          </div>

          {fineBarData.length > 0 && (
            <div className={styles.chartCard}>
              <h3 className={styles.sectionTitle}>Top Fine Holders</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={fineBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                  <XAxis dataKey="name" stroke="#9090b0" fontSize={11} />
                  <YAxis stroke="#9090b0" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#1e1e35", border: "1px solid #2a2a4a", borderRadius: 8 }} />
                  <Bar dataKey="fine" fill="#f87171" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className={styles.chartCard}>
            <h3 className={styles.sectionTitle}>Fine Management</h3>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead><tr><th>Name</th><th>Phone</th><th>Total Fine</th><th>Weekly Fine</th><th>Actions</th></tr></thead>
                <tbody>
                  {[...users].sort((a, b) => (b.fine || 0) - (a.fine || 0)).map(u => (
                    <tr key={u.userId}>
                      <td>{u.registeredName || u.name || "—"}</td>
                      <td style={{ color: "var(--text2)", fontSize: "0.8rem" }}>{u.phone}</td>
                      <td style={{ color: u.fine > 0 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>₹{u.fine || 0}</td>
                      <td style={{ color: "var(--text2)" }}>₹{u.weeklyFine || 0}</td>
                      <td>
                        <button className={styles.actionBtn} onClick={() => adjustFine(u.phone, u.fine)}>±Adjust</button>
                        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => resetFine(u.phone)}>Reset</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── QUESTIONS ── */}
      {tab === "questions" && (
        <>
          <div className={styles.chartCard}>
            <h3 className={styles.sectionTitle}>{editQ ? "✏️ Edit Question" : "➕ Add New Question"}</h3>
            <form onSubmit={addQuestion} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label>Category</label>
                  <select value={qForm.category} onChange={e => setQForm({ ...qForm, category: e.target.value })} required>
                    <option value="">Select category</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Topic</label>
                  <input placeholder="e.g. Morning routines" value={qForm.topic} onChange={e => setQForm({ ...qForm, topic: e.target.value })} required />
                </div>
              </div>
              <div className={styles.field}>
                <label>Question</label>
                <textarea placeholder="Write the question…" value={qForm.question} onChange={e => setQForm({ ...qForm, question: e.target.value })} required />
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button type="submit" className={styles.submitBtn}>{editQ ? "Update" : "Add Question"}</button>
                {editQ && (
                  <button type="button" className={styles.actionBtn} style={{ padding: "0.7rem 1.2rem" }} onClick={() => { setEditQ(null); setQForm({ category: "", topic: "", question: "" }); }}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 className={styles.sectionTitle} style={{ margin: 0 }}>Question Bank ({filteredQuestions.length} / {questions.length})</h3>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <select className={styles.searchInput} style={{ width: "auto" }} value={qCatFilter} onChange={e => setQCatFilter(e.target.value)}>
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className={styles.searchInput} placeholder="Search questions…" value={qSearch} onChange={e => setQSearch(e.target.value)} />
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Category</th><th>Topic</th><th>Question</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filteredQuestions.map(q => (
                    <tr key={q._id}>
                      <td><span className={`${styles.roleBadge} ${styles.user}`} style={{ whiteSpace: "nowrap" }}>{q.category}</span></td>
                      <td style={{ color: "var(--text2)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>{q.topic}</td>
                      <td style={{ maxWidth: 320 }}>{q.question}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className={styles.actionBtn} onClick={() => startEdit(q)}>Edit</button>
                        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => deleteQuestion(q._id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
