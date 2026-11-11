import { useState } from 'react';
import { emailSchema, validateContact } from '../lib/contactValidation';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { IconEye, IconEyeOff, IconLock, IconMail } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { ErrorBanner } from '../components/Feedback';
import cabinImage from '../assets/laixia-cabana.webp';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [viewPassword, setViewPassword] = useState(false);
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

  const allowRegister = import.meta.env.VITE_ALLOW_REGISTER === 'true' || import.meta.env.VITE_ALLOW_REGISTER === '1';

  if (user) return <Navigate to="/" replace />;

  function validateDatos(): string | null {
    const emailResult = emailSchema.safeParse(newEmail);
    if (!emailResult.success) return emailResult.error.issues[0].message;
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
      await login(validateContact(emailSchema, email), password);
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
          email: validateContact(emailSchema, newEmail),
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
      await api('/auth/resend-confirmation', { method: 'POST', body: { email: validateContact(emailSchema, newEmail) } });
      setResent(true);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="laixia-login">
      <main className="laixia-login-panel d-flex align-items-center">
      <form className="laixia-login-form w-100 m-auto" onSubmit={handleSubmit}>
        <div className="laixia-login-brand d-flex flex-column align-items-center mb-4" aria-label="Laixia">
          <svg viewBox="0 0 112 48" fill="none" aria-hidden="true">
            <path d="M5 40 21 20c4-5 8-5 13 0l20 20M35 22 49 7c4-4 8-4 12 0l16 17 10 4 19 12-24-4-12-7" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>LAIXIA</span>
        </div>
        <div className="laixia-login-heading mb-4">
          <h1 className="fs-4 fw-bold mb-2">Bienvenido de nuevo</h1>
          <p className="small mb-0">Accedé al sistema de gestión de tu alojamiento</p>
        </div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div className="laixia-login-field d-flex align-items-center gap-2 px-3 py-2 mb-3 border rounded-3">
          <label className="visually-hidden" htmlFor="login-email">Correo electrónico</label>
          <IconMail size={22} aria-hidden="true" />
          <input id="login-email" className="form-control border-0 bg-transparent p-0" type="email" placeholder="Correo electrónico" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div className="laixia-login-field d-flex align-items-center gap-2 px-3 py-2 mb-3 border rounded-3">
          <label className="visually-hidden" htmlFor="login-password">Contraseña</label>
          <IconLock size={22} aria-hidden="true" />
            <input
              id="login-password"
              className="form-control border-0 bg-transparent p-0"
              type={viewPassword ? "text" : "password"}
              placeholder="Contraseña"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="laixia-login-password-toggle btn d-flex align-items-center justify-content-center flex-shrink-0 p-0 border-0"
              aria-label={viewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={viewPassword}
              onClick={() => setViewPassword(!viewPassword)}
            >
              {viewPassword ? <IconEyeOff size={22} /> : <IconEye size={22} />}
            </button>
        </div>
        <button type="submit" className="laixia-login-submit btn w-100 py-2 mt-2 rounded-3 fw-semibold" disabled={busy}>
          {busy ? "Ingresando…" : "Iniciar sesión"}
        </button>
        {allowRegister && (
          <a
            className="laixia-login-register d-block text-center mt-3 small"
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
        <p className="laixia-login-legal text-center mt-3 mb-0">
          <a href="/privacidad.html">Privacidad</a>
          <span aria-hidden="true"> · </span>
          <a href="/eliminacion-de-datos.html">Eliminación de datos</a>
        </p>
      </form>
      </main>
      <div className="laixia-login-photo" aria-hidden="true">
        <img src={cabinImage} alt="" fetchPriority="high" />
      </div>
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
