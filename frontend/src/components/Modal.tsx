import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Modal as BsModal } from 'bootstrap';
import { ErrorBanner } from './Feedback';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  error?: string | null;
  onDismissError?: () => void;
}

export function Modal({ open, title, onClose, children, wide, error, onDismissError }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
    const handler = () => onCloseRef.current();
    el.addEventListener('hidden.bs.modal', handler);
    return () => {
      el.removeEventListener('hidden.bs.modal', handler);
      BsModal.getInstance(el)?.dispose();
    };
  }, []);

  return (
    <div ref={ref} className="modal fade" tabIndex={-1} aria-hidden={!open}>
      <div
        className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${wide ? 'modal-lg' : ''}`}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Cerrar" />
          </div>
          <div className="modal-body">
            {error && <ErrorBanner message={error} onDismiss={onDismissError} />}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}