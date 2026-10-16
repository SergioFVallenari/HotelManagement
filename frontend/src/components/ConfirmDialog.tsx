import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Modal as BsModal } from 'bootstrap';
import { ErrorBanner } from './Feedback';

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', danger, onCancel, onConfirm, busy, error }: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const openRef = useRef(open);
  const shownRef = useRef(false);
  const hideRequestedRef = useRef(false);
  useEffect(() => {
    onCancelRef.current = onCancel;
    openRef.current = open;
  }, [onCancel, open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const instance = BsModal.getOrCreateInstance(el);
    if (open) {
      hideRequestedRef.current = false;
      shownRef.current = true;
      instance.show();
      return;
    }
    // hide() es no-op mientras la transición de apertura sigue en curso:
    // esperar a shown.bs.modal y ahí sí ocultar.
    const onShown = () => {
      if (!openRef.current) {
        hideRequestedRef.current = true;
        instance.hide();
      }
    };
    el.addEventListener('shown.bs.modal', onShown);
    hideRequestedRef.current = true;
    instance.hide();
    return () => el.removeEventListener('shown.bs.modal', onShown);
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      shownRef.current = false;
      // El cierre lo pidió el padre con open=false: no renotificar onCancel.
      if (hideRequestedRef.current) {
        hideRequestedRef.current = false;
        return;
      }
      onCancelRef.current();
    };
    el.addEventListener('hidden.bs.modal', handler);
    return () => {
      el.removeEventListener('hidden.bs.modal', handler);
      // dispose() no libera el scroll-lock que show() puso en <body>: si el
      // componente se desmonta con el modal abierto hay que sacarlo a mano.
      BsModal.getInstance(el)?.dispose();
      if (shownRef.current) {
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
      }
    };
  }, []);

  return (
    <div ref={ref} className="modal fade" tabIndex={-1} aria-hidden={!open}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Cerrar" />
          </div>
          <div className="modal-body">
            <div className="confirm-message">{message}</div>
            {error && <ErrorBanner message={error} />}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline-secondary" data-bs-dismiss="modal" disabled={busy}>
                Cancelar
              </button>
              <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
                {busy ? 'Procesando…' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}