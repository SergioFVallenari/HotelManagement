import { useState } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { AiSettings, Page, Reservation } from '../api/types';
import { DataTable } from '../components/DataTable';
import { DATA_TABLE_PAGE_SIZE } from '../lib/pagination';
import type { Column } from '../components/DataTable';
import { FilterPanel } from '../components/FilterPanel';
import { StatusBadge, RefundBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ReservationForm } from '../components/ReservationForm';
import { ReservationChat } from '../components/ReservationChat';
import { ReservationDetail } from '../components/ReservationDetail';
import { useApiError } from '../components/pagination';
import { dateShort, money, round2 } from '../lib/format';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'active', label: 'Activas' },
  { value: 'PENDING', label: 'Pago pendiente' },
  { value: 'RESERVED', label: 'Reservada' },
  { value: 'CHECKED_IN', label: 'Check-in' },
  { value: 'CHECKED_OUT', label: 'Check-out' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'STAFF', label: 'Cargadas en recepción' },
  { value: 'PUBLIC_LINK', label: 'Link de WhatsApp' },
];

// La bandeja de reservas se refresca sola para que las que llegan por el link
// de WhatsApp aparezcan sin recargar la pagina.
const POLL_MS = 30_000;

export function ReservationsPage() {
  const { data: aiSettings } = useApi<{ data: AiSettings }>('/ai/settings', { pollMs: POLL_MS });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedParams, setAppliedParams] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const query = buildQuery({
    search: appliedParams.search,
    status: appliedParams.status,
    source: appliedParams.source,
    from: appliedParams.from,
    to: appliedParams.to,
    page,
    pageSize: DATA_TABLE_PAGE_SIZE,
  });
  const { data, loading, error, reload } = useApi<Page<Reservation>>(`/reservations${query}`, { pollMs: POLL_MS });

  const [createOpen, setCreateOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { error: apiError, handleError, clearError } = useApiError();

  const reservations = data?.data ?? [];
  const pageAmounts = reservations.filter((reservation) => reservation.status !== 'CANCELLED').reduce(
    (amounts, reservation) => ({
      total: round2(amounts.total + reservation.totals.total),
      paid: round2(amounts.paid + reservation.totals.amountPaid),
      balance: round2(amounts.balance + reservation.totals.balance),
    }),
    { total: 0, paid: 0, balance: 0 },
  );
  const columns: Column<Reservation>[] = [
    { header: 'Reserva', render: (r) => <strong className="reservation-code">{r.code}</strong> },
    { header: 'Huésped / hab.', render: (r) => <><strong>{r.guest ? `${r.guest.lastName}, ${r.guest.firstName}` : '—'}</strong><small className="reservation-room">Hab. {r.rooms?.length ? r.rooms.map((line) => line.room?.number ?? '—').join(', ') : r.room?.number ?? '—'}</small></> },
    { header: 'Estadía', render: (r) => <>{dateShort(r.checkIn)} → {dateShort(r.checkOut)}</> },
    { header: 'Total', align: 'end', render: (r) => <strong>{money(r.totals.total)}</strong> },
    { header: 'Saldo', align: 'end', render: (r) => <strong className={r.totals.balance > 0 ? 'text-danger' : 'text-success'}>{money(r.totals.balance)}</strong> },
    { header: 'Estado', render: (r) => <span className="d-inline-flex align-items-center flex-wrap gap-2"><StatusBadge status={r.status} /><RefundBadge reservation={r} />{r.source === 'PUBLIC_LINK' && <span className={`badge rounded-pill ${r.status === 'PENDING' ? 'text-bg-info' : 'text-bg-light border'}`} title={r.status === 'PENDING' ? 'El huésped envió el comprobante: hay que verificarlo' : 'Reserva enviada por el link de WhatsApp'}>{r.status === 'PENDING' ? 'Verificar pago' : 'WhatsApp'}</span>}</span> },
  ];

  function applyFilters() {
    setPage(1);
    setAppliedParams({
      search: search.trim() || undefined,
      status: status || undefined,
      source: source || undefined,
      from: from || undefined,
      to: to || undefined,
    } as Record<string, string>);
  }

  async function openDetail(id: number) {
    setDetailId(id);
    setSelected(null);
    clearError();
    try {
      const result = await api<{ data: Reservation }>(`/reservations/${id}`);
      setSelected(result.data);
    } catch (err) {
      handleError(err);
    }
  }

  function handleChanged(updated: Reservation) {
    setSelected(updated);
    clearError();
    reload();
  }

  async function handleDetailChanged(updated: Reservation) {
    setSelected(updated);
    clearError();
    reload();
    if (updated.id !== detailId) setDetailId(updated.id);
  }

  return (
    <div className="reservations-page">
      <div className="page-header mb-4">
        <div>
          <h1 className="mb-2">Reservas</h1>
          <p className="text-secondary mb-0">Gestioná reservas, pagos y movimientos de tus huéspedes.</p>
        </div>
        <div className="page-actions">
          {aiSettings?.data.reservationAssistantEnabled && <button type="button" className="btn btn-outline-primary" onClick={() => setChatOpen(true)}>Reservar con IA</button>}
          <button type="button" className="btn btn-primary" onClick={() => { clearError(); setCreateOpen(true); }}>
            + Nueva reserva
          </button>
        </div>
      </div>

      {data && <div className="row g-3 mb-4 reservation-metrics">
        <div className="col-6 col-xl-3"><div className="card h-100"><div className="card-body"><div className="reservation-metric-label">Reservas encontradas</div><strong>{data.meta.total}</strong></div></div></div>
        <div className="col-6 col-xl-3"><div className="card h-100"><div className="card-body"><div className="reservation-metric-label">Confirmadas / activas · página</div><strong>{reservations.filter((r) => r.status === 'RESERVED' || r.status === 'CHECKED_IN').length}</strong></div></div></div>
        <div className="col-6 col-xl-3"><div className="card h-100"><div className="card-body"><div className="reservation-metric-label reservation-metric-label--danger">Canceladas · página</div><strong>{reservations.filter((r) => r.status === 'CANCELLED').length}</strong></div></div></div>
        <div className="col-12 col-sm-6 col-xl-3"><div className="card h-100"><div className="card-body"><div className="reservation-metric-label">Importes · página</div><dl className="mb-0 mt-2 small"><div className="d-flex flex-wrap justify-content-between gap-2"><dt>Total</dt><dd className="mb-0 fw-semibold">{money(pageAmounts.total)}</dd></div><div className="d-flex flex-wrap justify-content-between gap-2"><dt>Cobrado</dt><dd className="mb-0 fw-semibold">{money(pageAmounts.paid)}</dd></div><div className="d-flex flex-wrap justify-content-between gap-2"><dt>Pendiente</dt><dd className="mb-0 fw-semibold">{money(pageAmounts.balance)}</dd></div></dl></div></div></div>
        <div className="col-12"><p className="small text-secondary mb-0">Los importes corresponden a las reservas de esta página y excluyen las canceladas.</p></div>
      </div>}

      <FilterPanel title="Buscar y filtrar reservas" onApply={applyFilters} activeCount={Object.values(appliedParams).filter(Boolean).length}>
            <input
              placeholder="Buscar por código, huésped o habitación…"
              className="form-control filter-search"
              aria-label="Buscar reservas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="form-select filter-select" aria-label="Estado de la reserva" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select className="form-select filter-select" aria-label="Origen de la reserva" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="input-group mb-0 filter-date">
                <span className="input-group-text">Desde</span>
                <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="input-group mb-0 filter-date">
                <span className="input-group-text">Hasta</span>
                <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary">
              Aplicar
            </button>
      </FilterPanel>

      <DataTable columns={columns} rows={reservations} keyField="id" loading={loading} error={error} onRetry={reload} meta={data?.meta} onPageChange={setPage} className="reservations-table" actions={(r) => <button type="button" className="btn btn-sm btn-outline-secondary reservation-view" onClick={() => openDetail(r.id)}>Ver →</button>} />

      {chatOpen && <ReservationChat onClose={() => setChatOpen(false)} onCreated={(reservation) => { handleChanged(reservation); setDetailId(reservation.id); }} />}
      <ReservationForm
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          clearError();
        }}
        onCreated={handleChanged}
        onError={handleError}
        error={apiError}
        onDismissError={clearError}
      />

      <Modal
        open={detailId !== null && !selected}
        title="Reserva"
        onClose={() => {
          setDetailId(null);
          clearError();
        }}
        error={apiError}
        onDismissError={clearError}
      >
        <p className="text-secondary mb-0">
          {apiError ? 'No se pudo cargar el detalle de la reserva.' : 'Cargando detalle de la reserva…'}
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              setDetailId(null);
              clearError();
            }}
          >
            Cerrar
          </button>
        </div>
      </Modal>

      <ReservationDetail
        reservation={selected}
        onDeleted={() => { setDetailId(null); setSelected(null); clearError(); reload(); }}
        onClose={() => {
          setDetailId(null);
          clearError();
        }}
        onChanged={handleDetailChanged}
        onError={handleError}
        error={apiError}
        onDismissError={clearError}
      />
    </div>
  );
}
