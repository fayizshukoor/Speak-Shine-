export default function StatCard({ icon, label, value, color = "#7c6fff" }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}
