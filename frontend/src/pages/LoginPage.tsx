import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { IconBuildingSkyscraper } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { ErrorBanner } from '../components/Feedback';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [newHotel, setNewHotel] = useState('Hotel Principal');
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  const allowRegister = import.meta.env.VITE_ALLOW_REGISTER === 'true';

  if (user) return <Navigate to="/" replace />;

  function validateDatos(): string | null {
    if (!emailOk(newEmail)) return 'Ingresá un email válido.';
    if (!newHotel.trim()) return 'Ingresá el nombre de tu hotel.';
    if (newUsername.trim().length < 3) return 'El usuario debe tener al menos 3 caracteres.';
    if (newPassword.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (newPassword !== newPassword2) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/login/company', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const invalid = validateDatos();
    if (invalid) {
      setCreateError(invalid);
      return;
    }
    setRegistering(true);
    try {
      await api('/auth/register', {
        method: 'POST',
        body: {
          email: newEmail.trim(),
          username: newUsername.trim(),
          password: newPassword,
          hotelName: newHotel.trim(),
          ...(newName.trim() ? { name: newName.trim() } : {}),
        },
      });
      setCreated(true);
      setResent(false);
      setEmail(newEmail.trim());
      setNewName('');
      setNewUsername('');
      setNewPassword('');
      setNewPassword2('');
      setNewHotel('Hotel Principal');
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setRegistering(false);
    }
  }

  async function handleResend() {
    setCreateError(null);
    setResent(false);
    setResending(true);
    try {
      await api('/auth/resend-confirmation', { method: 'POST', body: { email: newEmail.trim() } });
      setResent(true);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-icon"><IconBuildingSkyscraper size={26} /></span>
          <h1>Hospia</h1>
          <p>Ingresá para administrar el alojamiento</p>
        </div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div className="mb-3">
          <label className="form-label" htmlFor="login-email">Email</label>
          <input id="login-email" className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="login-password">Contraseña</label>
          <input id="login-password" className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
        {allowRegister && (
          <a
            className="btn btn-success mt-2 w-100"
            data-bs-toggle="offcanvas"
            href="#createUser"
            role="button"
            aria-controls="createUser"
            onClick={() => {
              setCreated(false);
              setResent(false);
              setCreateError(null);
              setNewEmail('');
            }}
          >
            Crear usuario
          </a>
        )}
        {/* <p className="login-hint">
          Usuarios de prueba: <code>admin@hotelprincipal.test/admin123</code> ·{' '}
          <code>recepcion@hotelprincipal.test/recepcion123</code> (Hotel Principal) ·{' '}
          <code>sol@hotelsol.test/admin123</code> (Hotel Sol)
        </p> */}
        <p className="text-center small mt-3 mb-0">
          <a className="link-secondary" href="/privacidad.html">Privacidad</a>
          <span className="text-secondary"> · </span>
          <a className="link-secondary" href="/eliminacion-de-datos.html">Eliminación de datos</a>
        </p>
      </form>
      {allowRegister && (
      <div className="offcanvas offcanvas-fullscreen" id="createUser" aria-labelledby="createUserLabel">
        <div className="offcanvas-header">
          <h5 className="offcanvas-title" id="createUserLabel">Crear Usuario</h5>
          <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
        </div>
        <div className="offcanvas-body">
          <div className="register-panel">
            {createError && <ErrorBanner message={createError} onDismiss={() => setCreateError(null)} />}
            {created && (
              <div className="text-center">
                <div className="alert alert-success" role="alert">
                  Cuenta creada. Te enviamos un email a <strong>{newEmail}</strong> para confirmarla. Revisá tu correo
                  (y la carpeta de spam) y después ingresá.
                </div>
                {resent && <div className="alert alert-info" role="alert">Email reenviado.</div>}
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-outline-primary flex-fill" onClick={handleResend} disabled={resending || !newEmail.trim()}>
                    {resending ? 'Reenviando…' : 'Reenviar email'}
                  </button>
                  <button type="button" className="btn btn-primary flex-fill" data-bs-dismiss="offcanvas">
                    Ir a ingresar
                  </button>
                </div>
              </div>
            )}
            {!created && (
              <form onSubmit={handleCreateUser}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="create-email">Email *</label>
                  <input
                    id="create-email"
                    className="form-control"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    autoFocus
                    required
                  />
                  <div className="form-text">Te enviamos un email de confirmación a esta dirección.</div>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="create-hotel">Nombre del hotel *</label>
                  <input id="create-hotel" className="form-control" value={newHotel} onChange={(e) => setNewHotel(e.target.value)} required />
                  <div className="form-text">Se crea tu hotel y tu usuario de propietario.</div>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="create-name">Nombre</label>
                  <input id="create-name" className="form-control" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="create-username">Usuario *</label>
                  <input id="create-username" className="form-control" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="create-password">Contraseña *</label>
                  <input id="create-password" className="form-control" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="create-password2">Repetir contraseña *</label>
                  <input id="create-password2" className="form-control" type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-success w-100" disabled={registering}>
                  {registering ? 'Creando…' : 'Crear cuenta'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
