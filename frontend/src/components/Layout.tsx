import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const COLLAPSED_KEY = 'layout.sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '▤' },
  { to: '/calendar', label: 'Calendario', icon: '◫' },
  { to: '/rooms', label: 'Habitaciones', icon: '⌂' },
  { to: '/reservations', label: 'Reservas', icon: '🗓' },
  { to: '/guests', label: 'Huéspedes', icon: '👤' },
  { to: '/room-types', label: 'Tipos de habitación', icon: '☰' },
  { to: '/services', label: 'Servicios', icon: '✦' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const layoutClass = `${collapsed ? 'sidebar-collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`.trim();

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // storage no disponible — preferencia solo en memoria
      }
      return next;
    });
    setDrawerOpen((value) => !value);
  }

  return (
    <div className={`layout ${layoutClass}`}>
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
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
              onClick={() => setDrawerOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm sidebar-toggle"
              onClick={toggleSidebar}
              aria-label={drawerOpen || collapsed ? 'Mostrar menú' : 'Ocultar menú'}
              aria-expanded={drawerOpen || !collapsed}
            >
              ☰
            </button>
            <div className="topbar-title">Gestión de Alojamiento</div>
          </div>
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