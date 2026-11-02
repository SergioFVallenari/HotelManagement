import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import { DEMO_MODE } from '../demo/config';
import type { Payment, PaymentMethod, Reservation, ReservationReceiptDetail } from '../api/types';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from './DataTable';
import type { Column } from './DataTable';
import { ErrorBanner, Toast } from './Feedback';
import { dateShort, dateTimeShort, money, PAYMENT_METHODS, CHARGE_TYPES, CHECK_IN_TIME, CHECK_OUT_TIME, hotelToday } from '../lib/format';
import { RefundBadge } from './Badge';

const PAYMENTS_COLUMNS: Column<Payment>[] = [
  { header: 'Fecha', render: (p) => dateTimeShort(p.paidAt) },
  { header: 'Método', render: (p) => PAYMENT_METHODS[p.method] ?? p.method },
  { header: 'Monto', align: 'end', render: (p) => money(p.amount) },
];

interface Props {
  reservation: Reservation | null;
  onClose: () => void;
  onChanged: (reservation: Reservation) => void;
  onError: (err: unknown) => void;
  error?: string | null;
  onDismissError?: () => void;
}

export function ReservationDetail({ reservation, onClose, onChanged, onError, error, onDismissError }: Props) {
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'CASH' as PaymentMethod, reference: '' });
  const [busyAction, setBusyAction] = useState<null | 'checkin' | 'checkout' | 'cancel' | 'refund' | 'payment' | 'link' | 'approve' | 'reject'>(null);
  const [confirmAction, setConfirmAction] = useState<null | 'checkin' | 'checkout' | 'cancel' | 'refund' | 'approve'>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [receiptData, setReceiptData] = useState<ReservationReceiptDetail | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const onChangedRef = useRef(onChanged);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!reservation || reservation.status !== 'PENDING') return;
    const reservationId = reservation.id;
    const controller = new AbortController();
    let pending = false;
    let timer: number | undefined;
    const started = Date.now();

    function tick() {
      if (controller.signal.aborted || pending) return;
      pending = true;
      api<{ data: Reservation }>(`/reservations/${reservationId}`, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.data.status === 'RESERVED') {
            onChangedRef.current(result.data);
            showToast('Pago recibido');
            return;
          }
          scheduleNext();
        })
        .catch(() => {
          if (!controller.signal.aborted) scheduleNext();
        })
        .finally(() => { pending = false; });
    }

    function scheduleNext() {
      if (controller.signal.aborted) return;
      const delay = Date.now() - started < 30_000 ? 5000 : 15_000;
      timer = window.setTimeout(() => void tick(), delay);
    }

    function onVisibility() {
      if (document.hidden) return;
      if (timer) window.clearTimeout(timer);
      void tick();
    }

    timer = window.setTimeout(() => void tick(), 5000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation?.id, reservation?.status]);

  if (!reservation) return null;
  const current = reservation;

  const isActive = reservation.status === 'PENDING' || reservation.status === 'RESERVED' || reservation.status === 'CHECKED_IN';
  const status = reservation.status;
  const isPublicLink = reservation.source === 'PUBLIC_LINK';
  const awaitingVerification = isPublicLink && status === 'PENDING';
  const checkInAvailable = status !== 'RESERVED' || reservation.checkIn <= hotelToday();
  const linkVisible =
    !DEMO_MODE && !isPublicLink && ['PENDING', 'RESERVED', 'CHECKED_IN', 'CHECKED_OUT'].includes(status) && (reservation.mpCheckoutUrl != null || status === 'PENDING');
  const linkRegenerable = status === 'PENDING' || status === 'RESERVED' || status === 'CHECKED_IN';

  async function generateLink(regenerate = false) {
    setBusyAction('link');
    try {
      const result = await api<{ data: { reservation: Reservation; generated: boolean } }>(
        `/reservations/${current.id}/mp/order`,
        { method: 'POST', body: { regenerate } },
      );
      onChanged(result.data.reservation);
    } catch (err) {
      onError(err);
    } finally {
      setBusyAction(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(current.mpCheckoutUrl ?? '');
      showToast('Link copiado');
    } catch {
      onError(new Error('No se pudo copiar el link'));
    }
  }

  async function runAction(action: 'checkin' | 'checkout' | 'cancel' | 'refund') {
    setConfirmAction(null);
    setBusyAction(action);
    try {
      const path =
        action === 'checkin'
          ? `/reservations/${current.id}/check-in`
          : action === 'checkout'
            ? `/reservations/${current.id}/check-out`
            : action === 'cancel'
              ? `/reservations/${current.id}/cancel`
              : `/reservations/${current.id}/refund`;
      const result = await api<{ data: Reservation }>(path, { method: 'POST' });
      onChanged(result.data);
    } catch (err) {
      onError(err);
    } finally {
      setBusyAction(null);
    }
  }

  async function approveReceipt() {
    setConfirmAction(null);
    setBusyAction('approve');
    try {
      const result = await api<{ data: Reservation }>(`/reservations/${current.id}/approve`, { method: 'POST' });
      onChanged(result.data);
      showToast('Reserva confirmada con el anticipo registrado');
    } catch (err) {
      onError(err);
    } finally {
      setBusyAction(null);
    }
  }

  async function rejectReceipt() {
    setBusyAction('reject');
    try {
      const result = await api<{ data: Reservation }>(`/reservations/${current.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() || null },
      });
      setRejectOpen(false);
      setRejectReason('');
      onChanged(result.data);
      showToast('Reserva rechazada');
    } catch (err) {
      onError(err);
    } finally {
      setBusyAction(null);
    }
  }

  async function openReceipt() {
    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const result = await api<{ data: ReservationReceiptDetail }>(`/reservations/${current.id}/receipt`);
      setReceiptData(result.data);
    } catch (err) {
      setReceiptError((err as Error).message);
    } finally {
      setReceiptLoading(false);
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
    checkin: `Confirmar el check-in del grupo en todas las habitaciones de esta reserva. Fecha de reserva: ${dateShort(reservation.checkIn)}.`,
    checkout: 'Confirmar el check-out y liberar todas las habitaciones de esta reserva.',
    cancel: '¿Cancelar esta reserva? Se aplica la política de devolución (10 días de anticipación).',
    refund: `Confirmar que se devolvieron ${money(reservation.refundAmount)} al huésped.`,
    approve: `Confirmar que el anticipo de ${money(reservation.bookingLink?.deposit ?? 0)} fue acreditado. La reserva pasa a "Reservada" y el pago queda registrado como transferencia.`,
  };

  return (
    <>
      <Modal open title={`Reserva ${reservation.code}`} onClose={onClose} error={error} onDismissError={onDismissError} wide>
        <div className="reservation-detail">
        <div className="row g-3 reservation-overview">
          <div className="col-md-6">
            <section className="reservation-info-card">
            <h3 className="h6">Estadía</h3>
            <dl className="detail-list">
              <dt>Estado</dt>
              <dd><span className="d-inline-flex align-items-center gap-2"><ActionStatus status={status} /><RefundBadge reservation={reservation} />{isPublicLink && <span className="badge rounded-pill text-bg-light border">Link de WhatsApp</span>}</span></dd>
              <dt>Habitaciones</dt>
              <dd>
                {reservation.rooms?.length ? reservation.rooms.map((line) => <div key={line.roomId}>{line.room?.number} — {line.room?.type?.name} · {line.persons} personas{line.extraBeds > 0 ? ` + ${line.extraBeds} camas extras` : ''}</div>) : `${reservation.room?.number} — ${reservation.room?.name ?? reservation.room?.type?.name} · Cap. ${reservation.room?.capacity}`}
              </dd>
              <dt>Personas</dt>
              <dd>
                {reservation.persons}
                {reservation.extraBeds > 0 && <span className="text-secondary"> + {reservation.extraBeds} cama(s) extra(s)</span>}
              </dd>
              <dt>Fecha</dt>
              <dd>
                {dateShort(reservation.checkIn)} → {dateShort(reservation.checkOut)} ({reservation.totals.nights} noches)
                <span className="d-block text-secondary small">
                  Horario: check-in {CHECK_IN_TIME} · check-out {CHECK_OUT_TIME}
                </span>
              </dd>
              <dt>Check-in real</dt>
              <dd>{dateTimeShort(reservation.checkedInAt)}</dd>
              <dt>Check-out real</dt>
              <dd>{dateTimeShort(reservation.checkedOutAt)}</dd>
              {status === 'CANCELLED' && (
                <>
                  <dt>Cancelada el</dt>
                  <dd>{dateTimeShort(reservation.cancelledAt)}</dd>
                  <dt>Corresponde devolución</dt>
                  <dd>{reservation.refundEligible ? 'Sí' : 'No'}</dd>
                  {reservation.refundEligible && (
                    <>
                      <dt>Monto a devolver</dt>
                      <dd>{money(reservation.refundAmount)}</dd>
                      <dt>Devolución</dt>
                      <dd>{reservation.refunded ? `Realizada (${dateTimeShort(reservation.refundedAt)})` : 'Pendiente'}</dd>
                    </>
                  )}
                </>
              )}
              <dt>Notas</dt>
              <dd>{reservation.notes ?? '—'}</dd>
            </dl>
            </section>
          </div>

          <div className="col-md-6">
            <section className="reservation-info-card">
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
            </section>
          </div>
        </div>

        {(reservation.receipt || awaitingVerification) && (
          <div className={`receipt-section ${awaitingVerification ? 'receipt-section--pending' : ''}`}>
            <div className="d-flex align-items-start justify-content-between flex-wrap gap-2">
              <div>
                <h4 className="section-title mb-1">
                  {awaitingVerification ? 'Anticipo a verificar' : 'Comprobante del anticipo'}
                </h4>
                {reservation.receipt ? (
                  <p className="text-secondary small mb-0">
                    {reservation.receipt.fileName} · {fileSizeLabel(reservation.receipt.size)} ·{' '}
                    {dateTimeShort(reservation.receipt.createdAt)}
                    {reservation.receipt.externalRef && (
                      <>
                        {' '}
                        · Operación <strong>{reservation.receipt.externalRef}</strong>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-secondary small mb-0">El huésped no adjuntó comprobante.</p>
                )}
              </div>
              {reservation.receipt && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={openReceipt}
                  disabled={receiptLoading}
                >
                  {receiptLoading ? 'Abriendo…' : 'Ver comprobante'}
                </button>
              )}
            </div>
            {receiptError && (
              <div className="mt-2">
                <ErrorBanner message={receiptError} onDismiss={() => setReceiptError(null)} />
              </div>
            )}
            {awaitingVerification && (
              <>
                <p className="text-secondary small mb-2 mt-2">
                  Revisá que la transferencia coincida con el anticipo de {money(reservation.bookingLink?.deposit ?? 0)}. Al
                  aprobar, se registra el pago y la reserva pasa a <strong>Reservada</strong>.
                </p>
                <div className="d-flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => setConfirmAction('approve')}
                    disabled={!!busyAction}
                  >
                    {busyAction === 'approve' ? 'Confirmando…' : 'Aprobar pago'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => {
                      onDismissError?.();
                      setRejectOpen(true);
                    }}
                    disabled={!!busyAction}
                  >
                    Rechazar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <section className="reservation-panel reservation-financials">
          <h3 className="h6">Resumen de cuenta</h3>
          <div className="totals-box reservation-totals">
          <div>
            <span>Habitación</span>
            <strong>
              {(reservation.rooms?.length ?? 0) > 1 ? `${reservation.rooms!.length} habitaciones × ${reservation.totals.nights} noches` : reservation.room?.pricingMode === 'PER_PERSON'
                ? `${reservation.persons} pers. × ${reservation.totals.nights} noches × ${money(reservation.totals.roomPrice)}`
                : `${reservation.totals.nights} × ${money(reservation.totals.roomPrice)}`}
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
        </section>

        {linkVisible && (
          <div className="mp-payment-section mt-3">
            <h4 className="section-title">Pago online</h4>
            {reservation.mpCheckoutUrl ? (
              <>
                <div className="d-flex gap-2">
                  <code className="mp-link-code flex-grow-1">{reservation.mpCheckoutUrl}</code>
                  <button type="button" className="btn btn-sm btn-outline-secondary text-nowrap" onClick={copyLink}>
                    Copiar
                  </button>
                </div>
                <div className="d-flex gap-2 mt-2 flex-wrap">
                  <a
                    href={reservation.mpCheckoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-primary"
                  >
                    Abrir link de pago
                  </a>
                  {linkRegenerable && (
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => generateLink(true)} disabled={busyAction === 'link'}>
                      {busyAction === 'link' ? 'Regenerando…' : 'Regenerar link'}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => generateLink(false)} disabled={busyAction === 'link'}>
                {busyAction === 'link' ? 'Generando…' : 'Generar link de pago'}
              </button>
            )}
            {status === 'PENDING' && (
              <p className="text-secondary small mb-0 mt-2">
                Esperando que el huésped pague. La reserva se confirma automáticamente al recibir el pago.
              </p>
            )}
          </div>
        )}

        <div className="row g-4 reservation-breakdown">
          <div className="col-lg-6">
            <section className="reservation-panel h-100">
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
                      <th>Pers.</th>
                      <th>Tipo</th>
                      <th className="text-end">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservation.services.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}{s.description && <div className="small text-secondary text-break" style={{ whiteSpace: 'pre-line' }}>{s.description}</div>}</td>
                        <td>{s.quantity}</td>
                        <td className="text-secondary">
                          {s.chargeType === 'PER_PERSON'
                            ? s.personsCovered != null
                              ? `${s.personsCovered} de ${reservation.persons}`
                              : 'todas'
                            : '—'}
                        </td>
                        <td className="text-secondary">{s.chargeType ? CHARGE_TYPES[s.chargeType] : '—'}{s.chargeType === 'PER_ROOM_INTERVAL' && <div className="small">Cada {s.intervalDays} día(s), sin incluir el día de salida</div>}</td>
                        <td className="text-end">{money(s.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </section>
          </div>

          <div className="col-lg-6">
            <section className="reservation-panel h-100">
            <h3 className="h6">Pagos</h3>
            {reservation.payments.length === 0 ? (
              <p className="text-secondary mb-2">Sin pagos registrados.</p>
            ) : (
              <DataTable<Payment>
                columns={PAYMENTS_COLUMNS}
                rows={reservation.payments}
                keyField="id"
                size="sm"
                variant="bare"
              />
            )}

            {status === 'CHECKED_OUT' && (
              <p className="text-success mb-2">
                {reservation.totals.balance <= 0
                  ? 'Reserva saldada y finalizada.'
                  : <>Aún quedan {money(reservation.totals.balance)} por cobrar.</>}
              </p>
            )}

            {isActive && !awaitingVerification && (
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
                      {Object.entries(PAYMENT_METHODS).filter(([value]) => !DEMO_MODE || value !== 'MERCADOPAGO').map(([value, label]) => (
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
            </section>
          </div>
        </div>

        {isActive && (
          <div className="modal-actions">
            {status === 'RESERVED' && (
              <button
                type="button"
                className="btn btn-success"
                onClick={() => setConfirmAction('checkin')}
                disabled={!!busyAction || !checkInAvailable}
                title={checkInAvailable ? undefined : `Check-in disponible desde el ${dateShort(reservation.checkIn)} (${CHECK_IN_TIME})`}
              >
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

        {status === 'CANCELLED' && reservation.refundEligible && !reservation.refunded && (
          <div className="modal-actions">
            <button type="button" className="btn btn-success" onClick={() => setConfirmAction('refund')} disabled={!!busyAction}>
              {busyAction === 'refund' ? 'Registrando…' : 'Marcar devolución realizada'}
            </button>
          </div>
        )}
        </div>
      </Modal>

      <Toast show={!!toast} message={toast ?? ''} onHide={() => setToast(null)} />

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction === 'cancel'
            ? 'Cancelar reserva'
            : confirmAction === 'checkin'
              ? 'Check-in'
              : confirmAction === 'checkout'
                ? 'Check-out'
                : confirmAction === 'approve'
                  ? 'Aprobar el anticipo'
                  : 'Devolución'
        }
        message={confirmAction ? confirmationMessages[confirmAction] : ''}
        confirmLabel={
          confirmAction === 'cancel'
            ? 'Cancelar reserva'
            : confirmAction === 'checkin'
              ? 'Confirmar check-in'
              : confirmAction === 'checkout'
                ? 'Confirmar check-out'
                : confirmAction === 'approve'
                  ? 'Aprobar y confirmar'
                  : 'Confirmar devolución'
        }
        danger={confirmAction === 'cancel'}
        busy={!!busyAction}
        error={error}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction === 'approve') void approveReceipt();
          else if (confirmAction) void runAction(confirmAction);
        }}
      />

      <Modal
        open={!!receiptData}
        title={receiptData?.fileName ?? 'Comprobante'}
        onClose={() => setReceiptData(null)}
        wide
      >
        {receiptData && (
          <>
            {receiptData.mimeType.startsWith('image/') ? (
              <img src={receiptData.url} alt="Comprobante de pago" className="receipt-preview" />
            ) : (
              <p className="text-secondary">
                El comprobante es un PDF de {fileSizeLabel(receiptData.size)}. Abrilo en una pestaña nueva para verlo.
              </p>
            )}
            <dl className="detail-list mt-3">
              <dt>Archivo</dt>
              <dd>{receiptData.fileName}</dd>
              <dt>Tamaño</dt>
              <dd>{fileSizeLabel(receiptData.size)}</dd>
              <dt>Subido</dt>
              <dd>{dateTimeShort(receiptData.createdAt)}</dd>
              <dt>Número de operación</dt>
              <dd>{receiptData.externalRef ?? '—'}</dd>
            </dl>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setReceiptData(null)}>
                Cerrar
              </button>
              <a className="btn btn-primary" href={receiptData.url} target="_blank" rel="noopener noreferrer">
                Abrir en una pestaña nueva
              </a>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={rejectOpen}
        title="Rechazar el comprobante"
        onClose={() => {
          setRejectOpen(false);
          setRejectReason('');
          onDismissError?.();
        }}
        error={error}
        onDismissError={onDismissError}
      >
        <p className="text-secondary">
          La reserva se cancela y el huésped no queda con la estadía confirmada. Escribí el motivo para tenerlo en las
          notas.
        </p>
        <label className="form-label">Motivo (opcional)</label>
        <textarea
          className="form-control"
          rows={3}
          maxLength={500}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Por ejemplo: el comprobante no coincide con el anticipo"
        />
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              setRejectOpen(false);
              setRejectReason('');
            }}
          >
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={rejectReceipt} disabled={busyAction === 'reject'}>
            {busyAction === 'reject' ? 'Rechazando…' : 'Rechazar reserva'}
          </button>
        </div>
      </Modal>
    </>
  );
}

function fileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ActionStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'text-bg-warning',
    RESERVED: 'text-bg-primary',
    CHECKED_IN: 'text-bg-success',
    CHECKED_OUT: 'text-bg-secondary',
    CANCELLED: 'text-bg-danger',
  };
  const labels: Record<string, string> = {
    PENDING: 'Pago pendiente',
    RESERVED: 'Reservada',
    CHECKED_IN: 'Check-in',
    CHECKED_OUT: 'Check-out',
    CANCELLED: 'Cancelada',
  };
  return <span className={`badge rounded-pill px-2 py-1 ${map[status] ?? 'text-bg-secondary'}`}>{labels[status] ?? status}</span>;
}
