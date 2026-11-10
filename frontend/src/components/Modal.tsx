import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { Modal as BsModal } from 'bootstrap';
import { ErrorBanner } from './Feedback';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  preventClose?: boolean;
}

export function Modal({ open, title, description, onClose, children, wide, error, onDismissError, preventClose = false }: ModalProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const shownRef = useRef(false);
  const hideRequestedRef = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !preventClose) return;
    const preventHide = (event: Event) => event.preventDefault();
    el.addEventListener('hide.bs.modal', preventHide);
    return () => el.removeEventListener('hide.bs.modal', preventHide);
  }, [preventClose]);
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
    <div ref={ref} className="modal fade laixia-modal" tabIndex={-1} aria-hidden={!open} aria-labelledby={titleId}>
      <div
        className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${wide ? 'modal-lg' : ''}`}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div><h5 id={titleId} className="modal-title">{title}</h5>{description && <p className="modal-description">{description}</p>}</div>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Cerrar" disabled={preventClose} />
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
