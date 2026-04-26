import styles from "./StatCard.module.css";

export default function StatCard({ icon, label, value, color }) {
  return (
    <div className={styles.card} style={{ "--accent-color": color }}>
      <div className={styles.icon}>{icon}</div>
      <div className={styles.info}>
        <p className={styles.label}>{label}</p>
        <p className={styles.value}>{value}</p>
      </div>
    </div>
  );
}
