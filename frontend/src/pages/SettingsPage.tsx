import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { IconBrandInstagram, IconCreditCard, IconSparkles } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { api, BACKEND_ORIGIN } from '../api/client';
import { useApi } from '../api/useApi';
import type { AiConfig, AiSettings, MpConnection } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Feedback';
import { useApiError } from '../components/pagination';
import { dateTimeShort } from '../lib/format';
import { APP_RETURN_TO, closeAuthTab, extractOauthQuery, isNative, openAuthTab } from '../lib/mpOauth';

function AiAssistantSection() {
  const { data: config } = useApi<{ data: AiConfig }>('/ai/config');
  const { data, loading, error, reload } = useApi<{ data: AiSettings }>('/ai/settings');
  const settings = data?.data;
  const { error: apiError, handleError, clearError } = useApiError();
  const [overrides, setOverrides] = useState<Partial<AiSettings>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // El form se deriva en render: settings del backend + overrides del usuario.
  // Así no hay setState en effect y un refetch no pisa lo que se está editando.
  const form: AiSettings = {
    enabled: settings?.enabled ?? false,
    autoReply: settings?.autoReply ?? true,
    instructions: settings?.instructions ?? null,
    ...overrides,
  };

  function patch(partial: Partial<AiSettings>) {
    setOverrides((current) => ({ ...current, ...partial }));
  }

  async function save() {
    setSaving(true);
    clearError();
    try {
      await api('/ai/settings', {
        method: 'PUT',
        body: {
          enabled: form.enabled,
          autoReply: form.autoReply,
          instructions: form.instructions?.trim() || null,
        },
      });
      setToast('Configuración del asistente guardada.');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card shadow-sm">
      <div className="card-body">
        {config?.data.configured === false && (
          <div className="alert alert-warning mb-3">
            El asistente no está configurado en el backend (falta <code>GEMINI_API_KEY</code>). Los borradores y las
            respuestas automáticas no van a funcionar hasta cargarla.
          </div>
        )}
        {loading || !settings ? (
          <p className="text-secondary mb-0">Cargando configuración…</p>
        ) : error ? (
          <div className="alert alert-danger mb-0 d-flex justify-content-between align-items-center">
            <span>{error}</span>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={reload}>
              Reintentar
            </button>
          </div>
        ) : (
          <div>
            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="ai-enabled"
                checked={form.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="ai-enabled">
                Habilitar el asistente de IA
              </label>
              <div className="form-text">Muestra el botón de borradores en la bandeja de mensajes.</div>
            </div>
            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="ai-auto-reply"
                checked={form.autoReply}
                onChange={(e) => patch({ autoReply: e.target.checked })}
                disabled={!form.enabled}
              />
              <label className="form-check-label" htmlFor="ai-auto-reply">
                Respuesta automática
              </label>
              <div className="form-text">
                Cuando la consulta es simple (precios y datos del hotel), la IA responde sola al huésped. Lo demás queda
                como borrador para revisar.
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="ai-instructions">
                Instrucciones para el asistente
              </label>
              <textarea
                className="form-control"
                id="ai-instructions"
                rows={3}
                maxLength={2000}
                placeholder="Ej.: Contestar siempre con emojis, no ofrecer late check-out, mencionar que el desayuno está incluido…"
                value={form.instructions ?? ''}
                onChange={(e) => patch({ instructions: e.target.value })}
              />
              <div className="form-text">Contexto extra que la IA usa al responder (opcional).</div>
            </div>
            {apiError && <div className="alert alert-danger">{apiError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
      <Toast show={!!toast} message={toast ?? ''} onHide={() => setToast(null)} />
    </div>
  );
}
interface InstagramStatus {
  connected: boolean;
  igBusinessAccountId?: string;
  username?: string;
  active?: boolean;
  connectedAt?: string;
  lastSyncAt?: string | null;
}

const REASON_MESSAGES: Record<string, string> = {
  denied: 'Se canceló la conexión con Instagram.',
  invalid_state: 'La conexión expiró o no es válida. Volvé a intentar.',
  state_expired: 'La conexión expiró. Volvé a intentar.',
  forbidden: 'No tenés permisos para conectar Instagram en este hotel.',
  oauth_failed: 'No se pudo conectar con Instagram. Reintentá más tarde.',
};

interface CallbackResult {
  handled: boolean;
  toast: string | null;
  error: string | null;
}

function readCallback(): CallbackResult {
  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') !== 'instagram') {
    return { handled: false, toast: null, error: null };
  }
  window.history.replaceState({}, '', window.location.pathname);
  if (params.get('ok') === '1') {
    return { handled: true, toast: 'Instagram conectado correctamente.', error: null };
  }
  const reason = params.get('reason') ?? 'oauth_failed';
  return { handled: true, toast: null, error: REASON_MESSAGES[reason] ?? REASON_MESSAGES.oauth_failed };
}

function InstagramSettingsSection() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<{ data: InstagramStatus }>(
    '/integrations/instagram/status',
  );
  const connection = data?.data;
  const { error: apiError, handleError, clearError } = useApiError();
  const [connecting, setConnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [callback] = useState(readCallback);
  const [toast, setToast] = useState<string | null>(callback.toast);

  useEffect(() => {
    if (!callback.handled) return;
    if (user?.role !== 'ADMIN' && user?.role !== 'OWNER') return;
    reload();
  }, [callback.handled, user?.role, reload]);

  async function connect() {
    if (!user) return;
    setConnecting(true);
    clearError();
    try {
      const query = new URLSearchParams({ companyId: String(user.companyId) }).toString();
      const result = await api<{ data: { url: string } }>(
        `/integrations/instagram/auth/url?${query}`,
      );
      window.location.href = result.data.url;
    } catch (err) {
      setConnecting(false);
      handleError(err);
    }
  }

  async function disconnect() {
    setDisconnectOpen(false);
    clearError();
    try {
      await api('/integrations/instagram/connection', { method: 'DELETE' });
      setToast('Instagram desconectado.');
      reload();
    } catch (err) {
      handleError(err);
    }
  }

  const shownError = apiError ?? callback.error;

  return (
    <div>
      <h2 className="h5 mb-1">Redes sociales</h2>
      <p className="text-secondary mb-3">
        Conexión de la cuenta de Instagram Business del hotel para responder mensajes.
      </p>

      <div className="card shadow-sm">
        <div className="card-body">
          {loading ? (
            <p className="text-secondary mb-0">Consultando conexión…</p>
          ) : error ? (
            <div className="alert alert-danger mb-0 d-flex justify-content-between align-items-center">
              <span>{error}</span>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={reload}>
                Reintentar
              </button>
            </div>
          ) : connection?.connected ? (
            <div>
              <div className="d-flex align-items-center gap-2 mb-3">
                <span className="badge rounded-pill px-2 py-1 text-bg-success">Conectado</span>
                <span className="text-success fw-semibold">Cuenta de Instagram Business activa</span>
              </div>
              <dl className="detail-list">
                <dt>Usuario de Instagram</dt>
                <dd>{connection.username ? `@${connection.username}` : '—'}</dd>
                <dt>ID de Instagram</dt>
                <dd>{connection.igBusinessAccountId ?? '—'}</dd>
                <dt>Conectada el</dt>
                <dd>{dateTimeShort(connection.connectedAt)}</dd>
                <dt>Última sincronización</dt>
                <dd>{connection.lastSyncAt ? dateTimeShort(connection.lastSyncAt) : 'Todavía no sincronizó'}</dd>
              </dl>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={connect}
                  disabled={connecting}
                >
                  {connecting ? 'Redirigiendo…' : 'Reconectar'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => setDisconnectOpen(true)}
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-secondary">
                Conectá la cuenta de Instagram profesional (Business o Creator) del hotel para
                responder mensajes.
              </p>
              <button type="button" className="btn btn-primary" onClick={connect} disabled={connecting}>
                {connecting ? 'Redirigiendo…' : 'Conectar Instagram'}
              </button>
            </div>
          )}
        </div>
      </div>

      {shownError && <div className="alert alert-danger mt-3 mb-0">{shownError}</div>}

      <ConfirmDialog
        open={disconnectOpen}
        title="Desconectar Instagram"
        message={
          <>
            <p>¿Desconectar la cuenta de Instagram del hotel?</p>
            <p className="text-secondary mb-0">
              Se eliminarán definitivamente las conversaciones y los mensajes de esta cuenta. No se
              podrá deshacer; tendrás que conectar Instagram de nuevo para volver a recibir mensajes.
            </p>
          </>
        }
        confirmLabel="Desconectar"
        danger
        onCancel={() => {
          setDisconnectOpen(false);
          clearError();
        }}
        onConfirm={disconnect}
        error={shownError}
      />

      <Toast show={!!toast} message={toast ?? ''} onHide={() => setToast(null)} />
    </div>
  );
}

function MercadoPagoSection() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<{ data: MpConnection }>('/mp/connection');
  const connection = data?.data;
  const { error: apiError, handleError, clearError } = useApiError();
  const [connecting, setConnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);
  const popupResultRef = useRef(false);
  // Marca que hay un Custom Tab abierto esperando el deep link, para que el
  // watchdog de browserFinished sepa si todavia hay que hacer algo.
  const nativeOauthRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyOauthResult = useCallback(
    (query: string) => {
      const params = new URLSearchParams(query);
      if (params.get('mp') === 'connected') {
        setToast('MercadoPago conectado correctamente.');
        reload();
      } else if (params.get('mp') === 'error') {
        const reason = params.get('reason') ?? 'unknown';
        const message =
          reason === 'denied'
            ? 'Se canceló la conexión con MercadoPago.'
            : reason === 'invalid_state' || reason === 'no_code'
              ? 'La conexión expiró. Volvé a intentar.'
              : 'No se pudo conectar con MercadoPago. Reintentá más tarde.';
        handleError(new Error(message));
        reload();
      } else {
        return;
      }
      setConnecting(false);
    },
    [reload, handleError],
  );

  // applyOauthResult depende de handleError, que useApiError recrea en cada
  // render. Si el efecto nativo lo tuviera en las deps se desarmaria y rearma
  // los listeners de Capacitor en cada render, y el deep link se puede perder
  // en el hueco entre el cleanup y el registro nuevo.
  const applyOauthResultRef = useRef(applyOauthResult);
  useEffect(() => {
    applyOauthResultRef.current = applyOauthResult;
  }, [applyOauthResult]);

  // El callback de MercadoPago responde en el popup con un postMessage y se
  // cierra solo. Aca lo recibimos y la ventana original muestra el resultado.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== popupRef.current) return;
      if (BACKEND_ORIGIN && event.origin !== BACKEND_ORIGIN) return;
      const data = event.data as { type?: unknown; query?: unknown } | null;
      if (!data || data.type !== 'mp:oauth' || typeof data.query !== 'string') return;
      popupResultRef.current = true;
      stopPolling();
      applyOauthResult(data.query);
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      stopPolling();
    };
  }, [applyOauthResult, stopPolling]);

  // Si el usuario cierra el popup a mano en MercadoPago, no llega ningun
  // mensaje. Recargamos igual para no quedar mostrando "no conectado".
  const watchPopup = useCallback(
    (popup: Window) => {
      stopPolling();
      popupResultRef.current = false;
      popupRef.current = popup;
      pollRef.current = window.setInterval(() => {
        if (!popup.closed) return;
        stopPolling();
        if (popupResultRef.current) return;
        popupResultRef.current = true;
        setConnecting(false);
        reload();
      }, 700);
    },
    [stopPolling, reload],
  );

  useEffect(() => {
    if (user?.role !== 'ADMIN' && user?.role !== 'OWNER') return;
    if (new URLSearchParams(window.location.search).has('mp')) {
      applyOauthResult(window.location.search);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user?.role, applyOauthResult]);

  // En nativo el callback no vuelve a la SPA: finishOauth redirige a
  // gestionhotel://oauth/settings?mp=..., el intent-filter de Android abre la
  // app y Capacitor emite appUrlOpen. Si Android destruyo la app durante el
  // OAuth el deep link abre el proceso nuevo y solo queda disponible como
  // launch url, asi que cubrimos appUrlOpen + getLaunchUrl.
  useEffect(() => {
    if (!isNative || user?.role !== 'ADMIN' && user?.role !== 'OWNER') return;

    const listeners: { remove: () => Promise<void> }[] = [];
    let disposed = false;

    function handleNativeUrl(url: string) {
      const query = extractOauthQuery(url);
      if (!query) return;
      nativeOauthRef.current = false;
      void closeAuthTab().catch(() => { });
      applyOauthResultRef.current(query);
    }

    async function register(promise: Promise<{ remove: () => Promise<void> }>): Promise<void> {
      const handle = await promise;
      // El listener tiene que quedar registrado aunque el componente ya se haya
      // desmontado, si no el deep link se pierde en un cleanup rapido.
      if (disposed) void handle.remove();
      else listeners.push(handle);
    }

    void register(App.addListener('appUrlOpen', ({ url }) => handleNativeUrl(url)));
    void register(
      Browser.addListener('browserFinished', () => {
        // Red de seguridad: si el usuario cierra el Custom Tab sin completar el
        // OAuth, o si el callback no vuelve por deep link (por ejemplo
        // mp=error&reason=invalid_state, que no tiene returnTo firmado),
        // recargamos el estado real en vez de dejar el boton en
        // "Abriendo MercadoPago…" para siempre.
        if (!nativeOauthRef.current) return;
        nativeOauthRef.current = false;
        setConnecting(false);
        reload();
      }),
    );

    // Cold start: si Android mato la app durante el OAuth, el deep link abre el
    // proceso nuevo y este es el unico lugar del que sale la URL.
    void App.getLaunchUrl()
      .then((launchUrl) => {
        if (!disposed && launchUrl) handleNativeUrl(launchUrl.url);
      })
      .catch(() => { });

    return () => {
      disposed = true;
      for (const listener of listeners) void listener.remove();
    };
  }, [user?.role, reload]);

  async function connect() {
    if (!connection || connection.connected) return;
    setConnecting(true);
    clearError();
    try {
      const result = await api<{ data: { url: string } }>('/mp/auth-url', {
        method: 'POST',
        body: { returnTo: isNative ? APP_RETURN_TO : window.location.origin },
      });
      if (isNative) {
        nativeOauthRef.current = true;
        await openAuthTab(result.data.url);
        return;
      }
      // Sin noopener: el popup necesita window.opener para devolvernos el
      // resultado y cerrarse solo. Solo aceptamos mensajes de nuestra ventanita.
      const popup = window.open(result.data.url, '_blank', 'width=720,height=680');
      if (!popup) {
        setConnecting(false);
        handleError(new Error('El navegador bloqueó la ventana de MercadoPago. Permití los popups e intentá de nuevo.'));
        return;
      }
      watchPopup(popup);
    } catch (err) {
      nativeOauthRef.current = false;
      setConnecting(false);
      handleError(err);
    }
  }

  async function disconnect() {
    setDisconnectOpen(false);
    clearError();
    try {
      await api('/mp/connection', { method: 'DELETE' });
      reload();
      setToast('Se desconectó la cuenta de MercadoPago.');
    } catch (err) {
      handleError(err);
    }
  }

  if (user?.role !== 'ADMIN' && user?.role !== 'OWNER') return null;

  return (
    <div>
      <h2 className="h5 mb-1">Pagos online</h2>
      <p className="text-secondary mb-3">Conexión de MercadoPago para cobros por reserva.</p>

      <div className="card shadow-sm">
        <div className="card-body">
          {loading ? (
            <p className="text-secondary mb-0">Consultando conexión…</p>
          ) : error ? (
            <div className="alert alert-danger mb-0 d-flex justify-content-between align-items-center">
              <span>{error}</span>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={reload}>
                Reintentar
              </button>
            </div>
          ) : connection?.connected ? (
            <div>
              <div className="d-flex align-items-center gap-2 mb-3">
                <span className="badge rounded-pill px-2 py-1 text-bg-success">Conectado</span>
                <span className="text-success fw-semibold">Cuenta de MercadoPago activa</span>
              </div>
              <dl className="detail-list">
                <dt>Email</dt>
                <dd>{connection.mpEmail ?? '—'}</dd>
                <dt>ID de usuario (MercadoPago)</dt>
                <dd>{connection.mpUserId ?? '—'}</dd>
                <dt>Conectada el</dt>
                <dd>{dateTimeShort(connection.connectedAt)}</dd>
                <dt>Última renovación de token</dt>
                <dd>{dateTimeShort(connection.lastRefreshedAt)}</dd>
              </dl>
              <div className="modal-actions">
                <a
                  href="https://www.mercadopago.com.ar/home"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary"
                >
                  Ir a MercadoPago
                </a>
                <button type="button" className="btn btn-outline-danger" onClick={() => setDisconnectOpen(true)}>
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-3">
                Todavía no hay una cuenta de MercadoPago conectada. Al conectarla, vas a poder generar links de
                pago por reserva y recibir los cobros directamente en la cuenta del hotel.
              </p>
              <button type="button" className="btn btn-primary" onClick={connect} disabled={connecting}>
                {connecting ? 'Abriendo MercadoPago…' : 'Conectar MercadoPago'}
              </button>
            </div>
          )}
        </div>
      </div>

      {apiError && (
        <div className="alert alert-danger mt-3 mb-0">
          {apiError}
        </div>
      )}

      <ConfirmDialog
        open={disconnectOpen}
        title="Desconectar MercadoPago"
        message={
          <>
            <p>¿Desconectar la cuenta de MercadoPago?</p>
            <p className="text-secondary mb-0">
              Los links de pago existentes seguirán funcionando, pero no se podrán generar nuevos hasta reconectar.
            </p>
          </>
        }
        confirmLabel="Desconectar"
        danger
        onCancel={() => {
          setDisconnectOpen(false);
          clearError();
        }}
        onConfirm={disconnect}
        error={apiError}
      />

      <Toast show={!!toast} message={toast ?? ''} onHide={() => setToast(null)} />
    </div>
  );
}

type SettingsTab = 'pagos' | 'redes' | 'ia';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: ReactNode }> = [
  { id: 'pagos', label: 'Pagos online', icon: <IconCreditCard size={16} /> },
  { id: 'redes', label: 'Redes sociales', icon: <IconBrandInstagram size={16} /> },
  { id: 'ia', label: 'Asistente de IA', icon: <IconSparkles size={16} /> },
];

// El callback de Instagram aterriza en /settings?tab=redes (redirect de
// /settings/instagram). La tab se lee solo al montar para que el
// history.replaceState que limpia el callback no la pise.
function initialTab(): SettingsTab {
  const value = new URLSearchParams(window.location.search).get('tab');
  return value === 'redes' || value === 'ia' ? value : 'pagos';
}

export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + offset + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    setTab(SETTINGS_TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  if (user?.role !== 'ADMIN' && user?.role !== 'OWNER') {
    return (
      <div className="text-center text-secondary py-5">
        Solo un administrador o propietario puede acceder a la configuración del hotel.
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Configuración</h1>
          <p className="text-secondary mb-0">Pagos online, redes sociales y asistente de IA del hotel.</p>
        </div>
      </div>

      <ul className="nav nav-tabs mb-4" role="tablist" aria-label="Configuración">
        {SETTINGS_TABS.map((item, index) => {
          const active = item.id === tab;
          return (
            <li className="nav-item" key={item.id} role="presentation">
              <button
                type="button"
                role="tab"
                id={`settings-tab-${item.id}`}
                aria-selected={active}
                aria-controls={`settings-panel-${item.id}`}
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                className={`nav-link d-flex align-items-center gap-2 ${active ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Los tres paneles quedan montados (ocultos con d-none): no se pierde lo
          editado en el form de IA y siguen vivos los listeners del OAuth de
          MercadoPago. */}
      <div
        role="tabpanel"
        id="settings-panel-pagos"
        aria-labelledby="settings-tab-pagos"
        className={tab === 'pagos' ? '' : 'd-none'}
      >
        <MercadoPagoSection />
      </div>
      <div
        role="tabpanel"
        id="settings-panel-redes"
        aria-labelledby="settings-tab-redes"
        className={tab === 'redes' ? '' : 'd-none'}
      >
        <InstagramSettingsSection />
      </div>
      <div
        role="tabpanel"
        id="settings-panel-ia"
        aria-labelledby="settings-tab-ia"
        className={tab === 'ia' ? '' : 'd-none'}
      >
        <h2 className="h5 mb-1">Asistente de IA</h2>
        <p className="text-secondary mb-3">
          Borradores y respuestas automáticas en la bandeja de mensajes (Instagram).
        </p>
        <AiAssistantSection />
      </div>
    </div>
  );
}