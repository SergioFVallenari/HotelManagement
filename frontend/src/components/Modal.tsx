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
  const openRef = useRef(open);
  const shownRef = useRef(false);
  const hideRequestedRef = useRef(false);
  useEffect(() => {
    onCloseRef.current = onClose;
    openRef.current = open;
  }, [onClose, open]);

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
      // El cierre lo pidió el padre con open=false: no renotificar onClose.
      if (hideRequestedRef.current) {
        hideRequestedRef.current = false;
        return;
      }
      onCloseRef.current();
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