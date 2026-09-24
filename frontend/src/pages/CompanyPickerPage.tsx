import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/Feedback';

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
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-icon">🏨</span>
          <h1>Elegí tu empresa</h1>
          <p>Ingresás a una de las empresas asociadas a tu usuario</p>
        </div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div className="d-grid gap-2 mb-3">
          {pendingCompanies.map((c) => (
            <button
              key={c.id}
              type="button"
              className="btn btn-outline-primary company-picker-item"
              onClick={() => handleSelect(c.id)}
              disabled={busyId !== null}
            >
              <span className="company-picker-name">{c.name}</span>
              <span className={`badge ${c.role === 'ADMIN' ? 'text-bg-dark' : 'text-bg-light'}`}>
                {c.role === 'ADMIN' ? 'Administrador' : 'Recepción'}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-link w-100" onClick={cancelLogin}>
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  );
}