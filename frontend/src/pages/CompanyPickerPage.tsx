import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconBuildingSkyscraper, IconChevronRight } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/Feedback';
import cabinImage from '../assets/laixia-cabana.webp';
import './LoginPage.css';

export function CompanyPickerPage() {
  const { user, pendingCompanies, selectCompany, cancelLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  if (user) return <Navigate to="/" replace />;
  if (!pendingCompanies) return <Navigate to="/login" replace />;

  async function handleSelect(companyId: number) {
    setBusyId(companyId);
    setError(null);
    try {
      await selectCompany(companyId);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="laixia-login">
      <main className="laixia-login-panel d-flex align-items-center">
      <div className="laixia-login-form w-100 m-auto">
        <div className="laixia-login-brand d-flex flex-column align-items-center mb-4" aria-label="Laixia">
          <svg viewBox="0 0 112 48" fill="none" aria-hidden="true">
            <path d="M5 40 21 20c4-5 8-5 13 0l20 20M35 22 49 7c4-4 8-4 12 0l16 17 10 4 19 12-24-4-12-7" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>LAIXIA</span>
        </div>
        <div className="laixia-login-heading mb-4">
          <h1 className="fs-4 fw-bold mb-2">Elegí tu empresa</h1>
          <p className="small mb-0">Seleccioná el alojamiento que querés administrar</p>
        </div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div className="d-grid gap-3 mb-3" aria-busy={busyId !== null}>
          {pendingCompanies.map((c) => (
            <button
              key={c.id}
              type="button"
              className="laixia-company-option btn d-flex align-items-center gap-3 p-3 rounded-3 text-start"
              onClick={() => handleSelect(c.id)}
              disabled={busyId !== null}
            >
              <IconBuildingSkyscraper size={24} className="flex-shrink-0" aria-hidden="true" />
              <span className="flex-grow-1 text-break">
                <span className="d-block fw-semibold">{c.name}</span>
                <span className="laixia-company-role d-block small mt-1">
                  {c.role === 'OWNER' ? 'Propietario' : c.role === 'ADMIN' ? 'Administrador' : 'Recepción'}
                </span>
              </span>
              {busyId === c.id ? (
                <span className="spinner-border spinner-border-sm flex-shrink-0" role="status">
                  <span className="visually-hidden">Ingresando…</span>
                </span>
              ) : <IconChevronRight size={20} className="flex-shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button type="button" className="laixia-login-register btn w-100 d-flex align-items-center justify-content-center gap-2 small" onClick={cancelLogin} disabled={busyId !== null}>
          <IconArrowLeft size={18} aria-hidden="true" />
          Volver al inicio de sesión
        </button>
      </div>
      </main>
      <div className="laixia-login-photo" aria-hidden="true">
        <img src={cabinImage} alt="" fetchPriority="high" />
      </div>
    </div>
  );
}
