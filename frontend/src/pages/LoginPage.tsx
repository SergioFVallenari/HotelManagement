import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/Feedback';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-icon">🏨</span>
          <h1>Hotel Manager</h1>
          <p>Ingresá para administrar el alojamiento</p>
        </div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div className="mb-3">
          <label className="form-label" htmlFor="login-username">Usuario</label>
          <input id="login-username" className="form-control" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="login-password">Contraseña</label>
          <input id="login-password" className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p className="login-hint">
          Usuarios de prueba: <code>admin/admin123</code> · <code>recepcion/recepcion123</code>
        </p>
      </form>
    </div>
  );
}