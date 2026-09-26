import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, BACKEND_ORIGIN } from '../api/client';
import { useApi } from '../api/useApi';
import type { MpConnection } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Feedback';
import { useApiError } from '../components/pagination';
import { dateTimeShort } from '../lib/format';

export function SettingsPage() {
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
      window.history.replaceState({}, '', window.location.pathname);
    },
    [reload, handleError],
  );

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
    if (user?.role !== 'ADMIN') return;
    if (new URLSearchParams(window.location.search).has('mp')) {
      applyOauthResult(window.location.search);
    }
  }, [user?.role, applyOauthResult]);

  async function connect() {
    if (!connection || connection.connected) return;
    setConnecting(true);
    clearError();
    try {
      const result = await api<{ data: { url: string } }>('/mp/auth-url', {
        method: 'POST',
        body: { returnTo: window.location.origin },
      });
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

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-center text-secondary py-5">
        Solo un administrador puede configurar los pagos online.
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Pagos online</h1>
          <p className="text-secondary mb-0">Conexión de MercadoPago para cobros por reserva.</p>
        </div>
      </div>

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
                  target="_blank"
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