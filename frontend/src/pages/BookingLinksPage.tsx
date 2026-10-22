import { useState } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { BookingLink } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { Toast } from '../components/Feedback';
import { BookingLinkForm } from '../components/BookingLinkForm';
import { useApiError } from '../components/pagination';
import { dateShort, dateTimeShort, money } from '../lib/format';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Esperando al huésped', cls: 'text-bg-info' },
  COMPLETED: { label: 'Enviada', cls: 'text-bg-success' },
  CANCELLED: { label: 'Anulada', cls: 'text-bg-secondary' },
};

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'OPEN', label: 'Esperando al huésped' },
  { value: 'COMPLETED', label: 'Enviadas' },
  { value: 'CANCELLED', label: 'Anuladas' },
];

export function BookingLinksPage() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useApi<{ data: BookingLink[] }>(`/booking-links${buildQuery({ status })}`);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<BookingLink | null>(null);
  const [cancelling, setCancelling] = useState<BookingLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { error: apiError, handleError, clearError } = useApiError();

  const links = data?.data ?? [];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copiado');
    } catch {
      handleError(new Error('No se pudo copiar el link. Copialo manualmente desde el campo.'));
    }
  }

  async function handleCancel() {
    if (!cancelling) return;
    setSaving(true);
    try {
      await api(`/booking-links/${cancelling.id}/cancel`, { method: 'POST' });
      setCancelling(null);
      reload();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  function handleCreated(link: BookingLink) {
    clearError();
    setCreated(link);
    reload();
  }

  const columns: Column<BookingLink>[] = [
    { header: 'Creada', render: (l) => dateTimeShort(l.createdAt) },
    {
      header: 'Estadía',
      render: (l) => (
        <>
          {dateShort(l.checkIn)} → {dateShort(l.checkOut)}
          <span className="d-block text-secondary small">
            {l.nights} noche(s) · {l.persons} pers.
            {l.extraBeds > 0 ? ` + ${l.extraBeds} cama(s)` : ''}
          </span>
        </>
      ),
    },
    { header: 'Habitación', render: (l) => l.room?.label ?? '—' },
    { header: 'Total', align: 'end', render: (l) => money(l.totals.total) },
    { header: 'Anticipo', align: 'end', render: (l) => money(l.totals.deposit) },
    {
      header: 'Estado',
      render: (l) => {
        const badge = STATUS_LABEL[l.status] ?? { label: l.status, cls: 'text-bg-secondary' };
        return (
          <>
            <span className={`badge rounded-pill px-2 py-1 ${badge.cls}`}>{badge.label}</span>
            {l.reservation && <span className="d-block small mt-1">{l.reservation.code}</span>}
          </>
        );
      },
    },
  ];

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Reservas por WhatsApp</h1>
          <p className="text-secondary mb-0">
            Prepará la estadía y compartí el link: el huésped completa sus datos y sube el comprobante del anticipo.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            clearError();
            setCreateOpen(true);
          }}
        >
          + Nueva solicitud
        </button>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body py-3">
          <div className="filter-row">
            <select className="form-select" style={{ width: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <DataTable<BookingLink>
        columns={columns}
        rows={links}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={reload}
        actions={(link) => (
          <div className="d-inline-flex gap-1 flex-wrap justify-content-end">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                clearError();
                setCreated(link);
              }}
            >
              Compartir
            </button>
            {link.status === 'OPEN' && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => {
                  clearError();
                  setCancelling(link);
                }}
              >
                Anular
              </button>
            )}
          </div>
        )}
      />

      <BookingLinkForm
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          clearError();
        }}
        onCreated={handleCreated}
        onError={handleError}
        error={apiError}
        onDismissError={clearError}
      />

      <Modal
        open={!!created}
        title={created ? `Link de ${created.room?.label ?? 'la solicitud'}` : 'Link'}
        onClose={() => {
          setCreated(null);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
      >
        {created && (
          <>
            <dl className="detail-list">
              <dt>Estadía</dt>
              <dd>
                {dateShort(created.checkIn)} → {dateShort(created.checkOut)} ({created.nights} noche(s))
              </dd>
              <dt>Total</dt>
              <dd>{money(created.totals.total)}</dd>
              <dt>Anticipo</dt>
              <dd className="text-success">{money(created.totals.deposit)}</dd>
              <dt>Vence</dt>
              <dd>{created.expiresAt ? dateTimeShort(created.expiresAt) : 'Sin vencimiento'}</dd>
            </dl>
            <label className="form-label">Link para el huésped</label>
            <div className="d-flex gap-2">
              <input className="form-control" value={created.url} readOnly onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-outline-secondary text-nowrap" onClick={() => copyLink(created.url)}>
                Copiar
              </button>
            </div>
            {created.share && (
              <>
                <label className="form-label mt-3">Mensaje sugerido</label>
                <textarea className="form-control" rows={5} value={created.share.message} readOnly />
                <a
                  className="btn btn-success w-100 mt-3"
                  href={created.share.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Compartir por WhatsApp
                </a>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setCreated(null)}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        title="Anular solicitud"
        message={
          <>
            <p>¿Anular esta solicitud de reserva?</p>
            <p className="text-secondary mb-0">El link deja de funcionar y el huésped ya no puede enviarlo.</p>
          </>
        }
        confirmLabel="Anular"
        danger
        busy={saving}
        error={apiError}
        onCancel={() => {
          setCancelling(null);
          clearError();
        }}
        onConfirm={handleCancel}
      />

      <Toast show={!!toast} message={toast ?? ''} onHide={() => setToast(null)} />
    </div>
  );
}
