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
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const instance = BsModal.getOrCreateInstance(el);
    if (open) {
      instance.show();
    } else {
      instance.hide();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onCancelRef.current();
    el.addEventListener('hidden.bs.modal', handler);
    return () => {
      el.removeEventListener('hidden.bs.modal', handler);
      BsModal.getInstance(el)?.dispose();
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