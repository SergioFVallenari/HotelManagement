import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { PaymentMethod, Reservation } from '../api/types';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { dateTimeShort, money, PAYMENT_METHODS } from '../lib/format';

interface Props {
  reservation: Reservation | null;
  onClose: () => void;
  onChanged: (reservation: Reservation) => void;
  onError: (err: unknown) => void;
}

export function ReservationDetail({ reservation, onClose, onChanged, onError }: Props) {
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'CASH' as PaymentMethod, reference: '' });
  const [busyAction, setBusyAction] = useState<null | 'checkin' | 'checkout' | 'cancel' | 'payment'>(null);
  const [confirmAction, setConfirmAction] = useState<null | 'checkin' | 'checkout' | 'cancel'>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  if (!reservation) return null;
  const current = reservation;

  const isActive = reservation.status === 'RESERVED' || reservation.status === 'CHECKED_IN';
  const status = reservation.status;

  async function runAction(action: 'checkin' | 'checkout' | 'cancel') {
    setConfirmAction(null);
    setBusyAction(action);
    try {
      const path =
        action === 'checkin'
          ? `/reservations/${current.id}/check-in`
          : action === 'checkout'
            ? `/reservations/${current.id}/check-out`
            : `/reservations/${current.id}/cancel`;
      const result = await api<{ data: Reservation }>(path, { method: 'POST' });
      onChanged(result.data);
    } catch (err) {
      onError(err);
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePayment(e: FormEvent) {
    e.preventDefault();
    setPaymentSaving(true);
    try {
      await api(`/reservations/${current.id}/payments`, {
        method: 'POST',
        body: {
          amount: Number(paymentForm.amount),
          method: paymentForm.method,
          reference: paymentForm.reference.trim() || null,
        },
      });
      const result = await api<{ data: Reservation }>(`/reservations/${current.id}`);
      onChanged(result.data);
      setPaymentForm({ amount: '', method: 'CASH', reference: '' });
    } catch (err) {
      onError(err);
    } finally {
      setPaymentSaving(false);
    }
  }

  const confirmationMessages = {
    checkin: 'Confirmar el check-in del huésped en esta habitación.',
    checkout: 'Confirmar el check-out y liberar la habitación.',
    cancel: '¿Cancelar esta reserva?',
  };

  return (
    <>
      <Modal open title={`Reserva ${reservation.code}`} onClose={onClose} wide>
        <div className="row g-4">
          <div className="col-md-6">
            <h3 className="h6">Resumen</h3>
            <dl className="detail-list">
              <dt>Estado</dt>
              <dd><ActionStatus status={status} /></dd>
              <dt>Habitación</dt>
              <dd>
                {reservation.room?.number} — {reservation.room?.name ?? reservation.room?.type?.name} · Cap. {reservation.room?.capacity}
              </dd>
              <dt>Fecha</dt>
              <dd>
                {reservation.checkIn} → {reservation.checkOut} ({reservation.totals.nights} noches)
              </dd>
              <dt>Check-in real</dt>
              <dd>{dateTimeShort(reservation.checkedInAt)}</dd>
              <dt>Check-out real</dt>
              <dd>{dateTimeShort(reservation.checkedOutAt)}</dd>
              <dt>Notas</dt>
              <dd>{reservation.notes ?? '—'}</dd>
            </dl>
          </div>

          <div className="col-md-6">
            <h3 className="h6">Huésped</h3>
            <dl className="detail-list">
              <dt>Nombre</dt>
              <dd>
                {reservation.guest?.lastName}, {reservation.guest?.firstName}
              </dd>
              <dt>Teléfono</dt>
              <dd>{reservation.guest?.phone ?? '—'}</dd>
              <dt>Email</dt>
              <dd>{reservation.guest?.email ?? '—'}</dd>
            </dl>
          </div>
        </div>

        <div className="totals-box">
          <div>
            <span>Habitación</span>
            <strong>
              {reservation.totals.nights} × {money(reservation.totals.roomPrice)}
            </strong>
          </div>
          <div>
            <span>Subtotal habitación</span>
            <strong>{money(reservation.totals.roomTotal)}</strong>
          </div>
          <div>
            <span>Servicios</span>
            <strong>{money(reservation.totals.servicesTotal)}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{money(reservation.totals.total)}</strong>
          </div>
          <div>
            <span>Pagado</span>
            <strong className="text-success">{money(reservation.totals.amountPaid)}</strong>
          </div>
          <div>
            <span>Saldo</span>
            <strong className={reservation.totals.balance > 0 ? 'text-danger' : 'text-success'}>
              {money(reservation.totals.balance)}
            </strong>
          </div>
        </div>

        <div className="row g-4">
          <div className="col-lg-6">
            <h3 className="h6">Servicios cargados</h3>
            {reservation.services.length === 0 ? (
              <p className="text-secondary mb-0">Sin servicios.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Servicio</th>
                      <th>Cant.</th>
                      <th className="text-end">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservation.services.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.quantity}</td>
                        <td className="text-end">{money(s.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="col-lg-6">
            <h3 className="h6">Pagos</h3>
            {reservation.payments.length === 0 ? (
              <p className="text-secondary mb-2">Sin pagos registrados.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-2">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Método</th>
                      <th className="text-end">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservation.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{dateTimeShort(p.paidAt)}</td>
                        <td>{PAYMENT_METHODS[p.method] ?? p.method}</td>
                        <td className="text-end">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {status === 'CHECKED_OUT' && (
              <p className="text-success mb-2">
                {reservation.totals.balance <= 0
                  ? 'Reserva saldada y finalizada.'
                  : <>Aún quedan {money(reservation.totals.balance)} por cobrar.</>}
              </p>
            )}

            {isActive && (
              <form className="border-top pt-3 mt-2" onSubmit={handlePayment}>
                <h4 className="section-title">Registrar pago</h4>
                <div className="filter-row">
                  <label className="field-inline">
                    <span className="form-label mb-0">Monto *</span>
                    <input type="number" min={0} step="0.01" className="form-control" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required />
                  </label>
                  <label className="field-inline">
                    <span className="form-label mb-0">Método</span>
                    <select className="form-select" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as PaymentMethod })}>
                      {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-inline flex-grow-1">
                    <span className="form-label mb-0">Referencia</span>
                    <input className="form-control" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="Opcional" />
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={paymentSaving}>
                    {paymentSaving ? 'Guardando…' : 'Cobrar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {isActive && (
          <div className="modal-actions">
            {status === 'RESERVED' && (
              <button type="button" className="btn btn-success" onClick={() => setConfirmAction('checkin')} disabled={!!busyAction}>
                Check-in
              </button>
            )}
            {status === 'CHECKED_IN' && (
              <button type="button" className="btn btn-primary" onClick={() => setConfirmAction('checkout')} disabled={!!busyAction}>
                Check-out
              </button>
            )}
            <button type="button" className="btn btn-outline-danger" onClick={() => setConfirmAction('cancel')} disabled={!!busyAction}>
              Cancelar reserva
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction === 'cancel' ? 'Cancelar reserva' : confirmAction === 'checkin' ? 'Check-in' : 'Check-out'}
        message={confirmAction ? confirmationMessages[confirmAction] : ''}
        confirmLabel={confirmAction === 'cancel' ? 'Cancelar reserva' : confirmAction === 'checkin' ? 'Confirmar check-in' : 'Confirmar check-out'}
        danger={confirmAction === 'cancel'}
        busy={!!busyAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && runAction(confirmAction)}
      />
    </>
  );
}

function ActionStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    RESERVED: 'text-bg-primary',
    CHECKED_IN: 'text-bg-success',
    CHECKED_OUT: 'text-bg-secondary',
    CANCELLED: 'text-bg-danger',
  };
  const labels: Record<string, string> = {
    RESERVED: 'Reservada',
    CHECKED_IN: 'Check-in',
    CHECKED_OUT: 'Check-out',
    CANCELLED: 'Cancelada',
  };
  return <span className={`badge rounded-pill px-2 py-1 ${map[status] ?? 'text-bg-secondary'}`}>{labels[status] ?? status}</span>;
}