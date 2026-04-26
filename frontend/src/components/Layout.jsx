import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation, Link } from "react-router-dom";

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    if (user?.role === "admin") navigate("/admin/login");
    else if (user?.role === "trainer") navigate("/trainer/login");
    else navigate("/login");
  };

  const navLink = (to, label) => (
    <Link to={to} className={`nav-link${location.pathname === to ? " active" : ""}`}>{label}</Link>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-emoji">🗣️</span>
          <span>Speak & Shine</span>
        </div>

        <nav>
          {user?.role === "admin" && (<>
            {navLink("/admin", "Admin")}
            {navLink("/trainer", "Trainer")}
            {navLink("/dashboard", "User View")}
          </>)}
          {user?.role === "trainer" && (<>
            {navLink("/trainer", "Dashboard")}
            {navLink("/dashboard", "User View")}
          </>)}
        </nav>

        <div className="header-right">
          <span className={`role-badge ${user?.role}`}>{user?.role}</span>
          <span className="header-name">{user?.name}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="app-main">
        {title && <h1 className="page-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
