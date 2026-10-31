import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function DemoBanner() {
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <>
      <section className="demo-banner" aria-label="Modo demostración">
        <div>
          <strong>Demostración · Datos ficticios</strong>
          <div className="small">Sin conexión a producción. Reservas, pagos y comprobantes simulados; catálogos editables.</div>
          <div className="small">Probá una <Link to="/reservations">reserva</Link>, el <Link to="/booking-links">link de WhatsApp</Link> o <Link to="/settings">personalizá su página</Link>. Los cambios se pierden al recargar.</div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-primary text-nowrap" onClick={() => setResetOpen(true)}>Reiniciar demo</button>
      </section>
      <ConfirmDialog open={resetOpen} title="Reiniciar demostración" message="Se perderán los cambios de esta sesión y se restaurarán los datos ficticios iniciales."
        confirmLabel="Reiniciar demo" onCancel={() => setResetOpen(false)} onConfirm={() => window.location.assign('/')} />
    </>
  );
}
