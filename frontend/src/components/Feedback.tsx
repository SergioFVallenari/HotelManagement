export function Spinner() {
  return <div className="spinner-border text-primary" role="status" aria-label="Cargando" />;
}

export function LoadState({ loading, error, empty, onRetry }: { loading: boolean; error: string | null; empty?: boolean; onRetry?: () => void }) {
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="alert alert-danger d-flex justify-content-between align-items-center mt-2" role="alert">
        <span>{error}</span>
        {onRetry && (
          <button type="button" className="btn btn-sm btn-outline-danger ms-3" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return <div className="text-center text-secondary py-5">No hay datos para mostrar</div>;
  }
  return null;
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="btn-close ms-3" onClick={onDismiss} aria-label="Cerrar" />
      )}
    </div>
  );
}

export function Toast({ show, message, onHide }: { show: boolean; message: string; onHide?: () => void }) {
  if (!show) return null;
  return (
    <div className="toast show align-items-center text-bg-success border-0 position-fixed top-0 start-50 translate-middle-x mt-3" style={{ zIndex: 1090 }} role="alert">
      <div className="d-flex">
        <div className="toast-body">{message}</div>
        {onHide && (
          <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={onHide} aria-label="Cerrar" />
        )}
      </div>
    </div>
  );
}