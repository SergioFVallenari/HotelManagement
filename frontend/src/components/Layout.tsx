import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  IconBed,
  IconBrandWhatsapp,
  IconBuildingSkyscraper,
  IconCalendarCheck,
  IconCalendarMonth,
  IconDoor,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconMessages,
  IconSparkles,
  IconUserPlus,
  IconUsers,
  IconSettings
} from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import '../crmTheme.css';
import { DEMO_MODE, DEMO_PATHS } from '../demo/config';
import { DemoBanner } from '../demo/DemoBanner';

const COLLAPSED_KEY = 'layout.sidebar-collapsed';
const THEME_KEY = 'layout.theme';

function readTheme(): 'light' | 'dark' {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
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
  icon: ComponentType<{ size?: number }>;
  roles?: ('OWNER' | 'ADMIN')[];
  end?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operación',
    items: [
      { to: '/', label: 'Dashboard', icon: IconLayoutDashboard },
      { to: '/calendar', label: 'Calendario', icon: IconCalendarMonth },
      { to: '/rooms', label: 'Habitaciones', icon: IconBed },
      { to: '/reservations', label: 'Reservas', icon: IconCalendarCheck },
      { to: '/booking-links', label: 'Reservas por WhatsApp', icon: IconBrandWhatsapp },
      { to: '/messages', label: 'Mensajes', icon: IconMessages },
      { to: '/guests', label: 'Huéspedes', icon: IconUsers },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { to: '/room-types', label: 'Tipos de habitación', icon: IconDoor },
      { to: '/services', label: 'Servicios', icon: IconSparkles },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: '/users', label: 'Usuarios', icon: IconUserPlus, roles: ['OWNER', 'ADMIN'] },
      { to: '/settings', label: 'Configuración', icon: IconSettings, roles: ['OWNER', 'ADMIN'], end: true }
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
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
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
      <aside id="main-sidebar" className="sidebar" aria-label="Menú principal">
        <div className="sidebar-brand">
          <span className="brand-icon"><IconBuildingSkyscraper size={26} /></span>
          <div>
            <strong>LAIXIA</strong>
            <small>{user?.companyName}</small>
          </div>
        </div>
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
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    end={item.end ?? item.to === '/'}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <span className="nav-icon"><item.icon size={20} /></span>
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
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
            <div className="topbar-title">SOFTWARE DE GESTIÓN HOTELERA</div>
          </div>
          <div className="topbar-actions">
            <div className="form-check form-switch crm-theme-switch">
              <input id="crm-light-mode" className="form-check-input" type="checkbox" role="switch"
                checked={theme === 'light'} onChange={(event) => setTheme(event.target.checked ? 'light' : 'dark')} />
              <label className="form-check-label" htmlFor="crm-light-mode">Modo claro</label>
            </div>
            <div className={`topbar-user ${DEMO_MODE ? '' : 'dropdown'}`}>
              <div
                className={`d-flex flex-column align-items-end text-end ${DEMO_MODE ? '' : 'dropdown-toggle'}`}
                data-bs-toggle={DEMO_MODE ? undefined : 'dropdown'}
                aria-expanded={DEMO_MODE ? undefined : false}
                role={DEMO_MODE ? undefined : 'button'}
                style={{ cursor: DEMO_MODE ? 'default' : 'pointer' }}
              >
                <span className="user-name mb-0">
                  {user?.name ?? user?.username}
                </span>
                <small className="user-role mb-0">
                  {user?.role === 'OWNER' ? 'Propietario' : user?.role === 'ADMIN' ? 'Administrador' : 'Recepción'}
                </small>
              </div>
              {!DEMO_MODE && <ul className="dropdown-menu dropdown-menu-end">
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
              </ul>}
            </div>
          </div>
        </header>
        {DEMO_MODE && <DemoBanner />}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
