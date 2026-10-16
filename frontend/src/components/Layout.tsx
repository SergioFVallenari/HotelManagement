import { useState } from 'react';
import type { ComponentType } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  IconBed,
  IconBuildingSkyscraper,
  IconCalendarCheck,
  IconCalendarMonth,
  IconDoor,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconSparkles,
  IconUserPlus,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';

const COLLAPSED_KEY = 'layout.sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  roles?: ('OWNER' | 'ADMIN')[];
}[] = [
  { to: '/', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/calendar', label: 'Calendario', icon: IconCalendarMonth },
  { to: '/rooms', label: 'Habitaciones', icon: IconBed },
  { to: '/reservations', label: 'Reservas', icon: IconCalendarCheck },
  { to: '/guests', label: 'Huéspedes', icon: IconUsers },
  { to: '/room-types', label: 'Tipos de habitación', icon: IconDoor },
  { to: '/services', label: 'Servicios', icon: IconSparkles },
  { to: '/users', label: 'Usuarios', icon: IconUserPlus, roles: ['OWNER', 'ADMIN'] },
  { to: '/settings', label: 'Pagos', icon: IconWallet, roles: ['OWNER', 'ADMIN'] },
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
          <span className="brand-icon"><IconBuildingSkyscraper size={26} /></span>
          <div>
            <strong>Hotel Manager</strong>
            <small>Panel de administración</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter(
            (item) => !item.roles || (user?.role !== undefined && item.roles.includes(user.role as 'OWNER' | 'ADMIN')),
          ).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              end={item.to === '/'}
              onClick={() => setDrawerOpen(false)}
            >
              <span className="nav-icon"><item.icon size={20} /></span>
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
              <IconMenu2 size={18} />
            </button>
            <div className="topbar-title">Gestión de Alojamiento</div>
          </div>
          <div className="topbar-user dropdown">
            <div
              className="d-flex flex-column align-items-end text-end dropdown-toggle"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              role="button"
              style={{ cursor: 'pointer' }}
            >
              <span className="user-name mb-0">
                {user?.name ?? user?.username}
              </span>
              <small className="user-role mb-0">
                {user?.role === 'OWNER' ? 'Propietario' : user?.role === 'ADMIN' ? 'Administrador' : 'Recepción'}
              </small>
            </div>
            <ul className="dropdown-menu dropdown-menu-end">
              <li>
                <NavLink className="dropdown-item" to="/perfil" onClick={() => setDrawerOpen(false)}>
                  Mi perfil
                </NavLink>
              </li>
              <li>
                <hr className="dropdown-divider" />
              </li>
              <li>
                <button type="button" className="dropdown-item" onClick={logout}>
                  <IconLogout size={16} className="me-2" />
                  Cerrar sesión
                </button>
              </li>
            </ul>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}