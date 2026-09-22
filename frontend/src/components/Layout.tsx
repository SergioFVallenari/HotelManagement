import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '▤' },
  { to: '/rooms', label: 'Habitaciones', icon: '⌂' },
  { to: '/reservations', label: 'Reservas', icon: '🗓' },
  { to: '/guests', label: 'Huéspedes', icon: '👤' },
  { to: '/room-types', label: 'Tipos de habitación', icon: '☰' },
  { to: '/services', label: 'Servicios', icon: '✦' },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">🏨</span>
          <div>
            <strong>Hotel Manager</strong>
            <small>Panel de administración</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              end={item.to === '/'}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">Gestión de Alojamiento</div>
          <div className="topbar-user">
            <span className="user-name">
              {user?.name ?? user?.username}
              <small className="user-role">{user?.role === 'ADMIN' ? 'Administrador' : 'Recepción'}</small>
            </span>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={logout}>
              Salir
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}