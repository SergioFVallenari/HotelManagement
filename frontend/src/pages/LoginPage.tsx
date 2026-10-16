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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [newHotel, setNewHotel] = useState('Hotel Principal');
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [registering, setRegistering] = useState(false);

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
      await login(username, password);
      navigate('/login/company', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendCode(e?: FormEvent) {
    e?.preventDefault();
    setCreateError(null);
    const invalid = validateDatos();
    if (invalid) {
      setCreateError(invalid);
      return;
    }
    setSendingCode(true);
    try {
      await api('/users/send-code', { method: 'POST', body: { email: newEmail.trim() } });
      setNewCode('');
      setStep(2);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setSendingCode(false);
    }
  }

  function handleBack() {
    setCreateError(null);
    setNewCode('');
    setStep(1);
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!/^\d{6}$/.test(newCode)) {
      setCreateError('El código debe tener 6 dígitos.');
      return;
    }
    setRegistering(true);
    try {
      await api('/users/register', {
        method: 'POST',
        body: {
          email: newEmail.trim(),
          code: newCode,
          username: newUsername.trim(),
          password: newPassword,
          hotelName: newHotel.trim(),
          ...(newName.trim() ? { name: newName.trim() } : {}),
        },
      });
      setCreated(true);
      setUsername(newUsername.trim());
      setNewName('');
      setNewUsername('');
      setNewEmail('');
      setNewCode('');
      setNewPassword('');
      setNewPassword2('');
      setNewHotel('Hotel Principal');
      setStep(1);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-icon"><IconBuildingSkyscraper size={26} /></span>
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
        {allowRegister && (
          <a
            className="btn btn-success mt-2 w-100"
            data-bs-toggle="offcanvas"
            href="#createUser"
            role="button"
            aria-controls="createUser"
            onClick={() => {
              setCreated(false);
              setCreateError(null);
            }}
          >
            Crear usuario
          </a>
        )}
        {/* <p className="login-hint">
          Usuarios de prueba: <code>admin/admin123</code> · <code>recepcion/recepcion123</code> (Hotel Principal) ·{' '}
          <code>sol/admin123</code> (Hotel Sol)
        </p> */}
      </form>
      {allowRegister && (
      <div className="offcanvas offcanvas-fullscreen" id="createUser" aria-labelledby="createUserLabel">
        <div className="offcanvas-header">
          <h5 className="offcanvas-title" id="createUserLabel">Crear Usuario</h5>
          <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
        </div>
        <div className="offcanvas-body">
          <div className="register-panel">
            {!created && (
              <div className="register-steps">
                <span className={`step ${step === 1 ? 'active' : 'done'}`}>1. Tus datos</span>
                <span className={`step ${step === 2 ? 'active' : ''}`}>2. Verificación</span>
              </div>
            )}
            {createError && <ErrorBanner message={createError} onDismiss={() => setCreateError(null)} />}
            {created && (
              <div className="text-center">
                <div className="alert alert-success" role="alert">
                  Usuario creado. Ya podés ingresar con tu usuario y contraseña.
                </div>
                <button type="button" className="btn btn-primary" data-bs-dismiss="offcanvas">
                  Ir a ingresar
                </button>
              </div>
            )}
            {!created && step === 1 && (
              <form onSubmit={handleSendCode}>
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
                  <div className="form-text">Te enviamos un código de verificación a este email.</div>
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
                <button type="submit" className="btn btn-success w-100" disabled={sendingCode}>
                  {sendingCode ? 'Enviando código…' : 'Enviar código y continuar'}
                </button>
              </form>
            )}
            {!created && step === 2 && (
              <form onSubmit={handleCreateUser}>
                <p className="text-secondary mb-3">
                  Enviamos un código de 6 dígitos a <strong>{newEmail}</strong>. Válido por 10 minutos.
                </p>
                <div className="mb-3">
                  <label className="form-label" htmlFor="create-code">Código de verificación *</label>
                  <input
                    id="create-code"
                    className="form-control register-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    required
                  />
                </div>
                <button type="submit" className="btn btn-success w-100" disabled={registering}>
                  {registering ? 'Creando…' : 'Crear usuario'}
                </button>
                <div className="d-flex gap-2 mt-3">
                  <button type="button" className="btn btn-outline-secondary flex-fill" onClick={handleBack} disabled={registering}>
                    ← Volver
                  </button>
                  <button type="button" className="btn btn-outline-primary flex-fill" onClick={() => handleSendCode()} disabled={sendingCode || registering}>
                    {sendingCode ? 'Reenviando…' : 'Reenviar código'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
