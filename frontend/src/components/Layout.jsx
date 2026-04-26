import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation, Link } from "react-router-dom";
import styles from "./Layout.module.css";

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    // Send to the correct login page based on role
    if (user?.role === "admin") navigate("/admin/login");
    else if (user?.role === "trainer") navigate("/trainer/login");
    else navigate("/login");
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.emoji}>🗣️</span>
          <span className={styles.name}>Speak & Shine</span>
        </div>

        {/* Role-based nav links */}
        <nav className={styles.nav}>
          {user?.role === "admin" && (
            <>
              <Link to="/admin"     className={`${styles.navLink} ${location.pathname === "/admin"     ? styles.navActive : ""}`}>Admin</Link>
              <Link to="/trainer"   className={`${styles.navLink} ${location.pathname === "/trainer"   ? styles.navActive : ""}`}>Trainer</Link>
              <Link to="/dashboard" className={`${styles.navLink} ${location.pathname === "/dashboard" ? styles.navActive : ""}`}>User View</Link>
            </>
          )}
          {user?.role === "trainer" && (
            <>
              <Link to="/trainer"   className={`${styles.navLink} ${location.pathname === "/trainer"   ? styles.navActive : ""}`}>Dashboard</Link>
              <Link to="/dashboard" className={`${styles.navLink} ${location.pathname === "/dashboard" ? styles.navActive : ""}`}>User View</Link>
            </>
          )}
        </nav>

        <div className={styles.right}>
          <span className={styles.badge} data-role={user?.role}>{user?.role}</span>
          <span className={styles.username}>{user?.name}</span>
          <button className={styles.logout} onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main className={styles.main}>
        {title && <h2 className={styles.pageTitle}>{title}</h2>}
        {children}
      </main>
    </div>
  );
}
