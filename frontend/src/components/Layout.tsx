import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconLogout, IconMenu2, IconX } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from './ConfirmDialog';
import dashboardIcon from '../assets/navigation/dashboard.svg';
import dashboardInactiveIcon from '../assets/navigation/dashboardInactivo.svg';
import calendarIcon from '../assets/navigation/calendario.svg';
import calendarActiveIcon from '../assets/navigation/calendarioActivo.svg';
import roomsIcon from '../assets/navigation/habitaciones.svg';
import reservationsIcon from '../assets/navigation/reservas.svg';
import whatsappIcon from '../assets/navigation/whatsapp.svg';
import messagesIcon from '../assets/navigation/mensajes.svg';
import guestsIcon from '../assets/navigation/huespedes.svg';
import roomTypesIcon from '../assets/navigation/tipos.svg';
import servicesIcon from '../assets/navigation/servicios.svg';
import usersIcon from '../assets/navigation/usuarios.svg';
import settingsIcon from '../assets/navigation/configuracion.svg';
import '../crmTheme.css';
import { DEMO_MODE, DEMO_PATHS } from '../demo/config';
import { DemoBanner } from '../demo/DemoBanner';

const COLLAPSED_KEY = 'layout.sidebar-collapsed';
const THEME_KEY = 'layout.theme';

function readTheme(): 'light' | 'dark' {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

type NavItem = {
  to: string;
  label: string;
  icon: string;
  activeIcon?: string;
  roles?: ('OWNER' | 'ADMIN')[];
  end?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operación',
    items: [
      { to: '/', label: 'Dashboard', icon: dashboardInactiveIcon, activeIcon: dashboardIcon },
      { to: '/calendar', label: 'Calendario', icon: calendarIcon, activeIcon: calendarActiveIcon },
      { to: '/rooms', label: 'Habitaciones', icon: roomsIcon },
      { to: '/reservations', label: 'Reservas', icon: reservationsIcon },
      { to: '/booking-links', label: 'Reservas por WhatsApp', icon: whatsappIcon },
      { to: '/messages', label: 'Mensajes', icon: messagesIcon },
      { to: '/guests', label: 'Huéspedes', icon: guestsIcon },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { to: '/room-types', label: 'Tipos de habitación', icon: roomTypesIcon },
      { to: '/services', label: 'Servicios', icon: servicesIcon },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: '/users', label: 'Usuarios', icon: usersIcon, roles: ['OWNER', 'ADMIN'] },
      { to: '/settings', label: 'Configuración', icon: settingsIcon, roles: ['OWNER', 'ADMIN'], end: true }
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const pageTitle = NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`),
  )?.label ?? (pathname === '/perfil' ? 'Mi perfil' : 'LAIXIA');
  const displayName = user?.name || user?.username || 'Usuario';
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);
  const layoutClass = `${collapsed ? 'sidebar-collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`.trim();
  function toggleSidebar() {
    if (window.matchMedia('(max-width: 899px)').matches) {
      setDrawerOpen((value) => !value);
      return;
    }
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // storage no disponible — preferencia solo en memoria
      }
      return next;
    });
  }

  return (
    <div className={`layout crm-theme ${layoutClass}`} data-bs-theme={theme}>
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <aside id="main-sidebar" className="sidebar" aria-label="Menú principal">
        <div className="sidebar-brand">
          <span className="brand-icon" aria-hidden="true">L</span>
          <div>
            <strong>LAIXIA</strong>
          </div>
        </div>
        <div className="sidebar-tagline">Gestión hotelera</div>
        <button type="button" className="btn sidebar-close sidebar-toggle-mobile" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú">
          <IconX size={20} />
        </button>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) => (!DEMO_MODE || DEMO_PATHS.includes(item.to)) && (!item.roles || (user?.role !== undefined && item.roles.includes(user.role as 'OWNER' | 'ADMIN'))),
            );
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="nav-group">
                <div className="nav-group-title">{group.title}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    aria-label={item.label}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    end={item.end ?? item.to === '/'}
                    onClick={() => setDrawerOpen(false)}
                  >
                    {({ isActive }) => <>
                      <span className="nav-icon"><img src={isActive ? item.activeIcon ?? item.icon : item.icon} alt="" width="19" height="19" /></span>
                      <span className="nav-label">{item.label}</span>
                    </>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer" title={user?.companyName}>
          <strong>{user?.companyName}</strong>
          <small>Plan de gestión</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm sidebar-toggle sidebar-toggle-mobile"
              onClick={toggleSidebar}
              aria-label={drawerOpen ? 'Ocultar menú' : 'Mostrar menú'}
              aria-expanded={drawerOpen}
              aria-controls="main-sidebar"
            >
              <IconMenu2 size={18} />
            </button>
            <nav className="topbar-title" aria-label="Ubicación actual">LAIXIA <span className="mx-2" aria-hidden="true">/</span> <span aria-current="page">{pageTitle}</span></nav>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm sidebar-toggle sidebar-toggle-desktop"
              onClick={toggleSidebar}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              aria-expanded={!collapsed}
              aria-controls="main-sidebar"
            >
              <IconMenu2 size={18} />
            </button>
            <div className="topbar-user dropdown">
              <button
                type="button"
                className="user-avatar"
                data-bs-toggle="dropdown"
                aria-expanded={false}
                aria-label={`Menú de ${displayName}`}
                title={displayName}
              >
                {initials}
              </button>
              <ul className="dropdown-menu dropdown-menu-end">
                <li className="px-3 py-2">
                  <strong className="d-block">{displayName}</strong>
                  <small className="user-role">
                    {user?.role === 'OWNER' ? 'Propietario' : user?.role === 'ADMIN' ? 'Administrador' : 'Recepción'}
                  </small>
                </li>
                <li className="px-3 py-2">
                  <div className="form-check form-switch crm-theme-switch">
                    <input id="crm-light-mode" className="form-check-input" type="checkbox" role="switch"
                      checked={theme === 'light'} onChange={(event) => setTheme(event.target.checked ? 'light' : 'dark')} />
                    <label className="form-check-label" htmlFor="crm-light-mode">Modo claro</label>
                  </div>
                </li>
                {!DEMO_MODE && <>
                  <li>
                    <NavLink className="dropdown-item" to="/perfil" onClick={() => setDrawerOpen(false)}>
                      Mi perfil
                    </NavLink>
                  </li>
                  <li>
                    <hr className="dropdown-divider" />
                  </li>
                  <li>
                    <button type="button" className="dropdown-item" onClick={() => setConfirmLogout(true)}>
                      <IconLogout size={16} className="me-2" />
                      Cerrar sesión
                    </button>
                  </li>
                </>}
              </ul>
            </div>
          </div>
        </header>
        {DEMO_MODE && <DemoBanner />}
        <main className="content">
          <Outlet />
        </main>
      </div>
      <ConfirmDialog open={confirmLogout} title="Cerrar sesión" message="¿Querés cerrar tu sesión?" confirmLabel="Cerrar sesión"
        onCancel={() => setConfirmLogout(false)} onConfirm={() => { setConfirmLogout(false); logout(); }} />
    </div>
  );
}
