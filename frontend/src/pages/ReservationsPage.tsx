import { useState } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { AiSettings, Page, Reservation } from '../api/types';
import { LoadState } from '../components/Feedback';
import { FilterPanel } from '../components/FilterPanel';
import { StatusBadge, RefundBadge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ReservationForm } from '../components/ReservationForm';
import { ReservationChat } from '../components/ReservationChat';
import { ReservationDetail } from '../components/ReservationDetail';
import { useApiError, PaginationBar } from '../components/pagination';
import { dateShort, money } from '../lib/format';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
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
  });
  const { data, loading, error, reload } = useApi<Page<Reservation>>(`/reservations${query}`, { pollMs: POLL_MS });

  const [createOpen, setCreateOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { error: apiError, handleError, clearError } = useApiError();

  const reservations = data?.data ?? [];

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
    <div>
      <div className="page-header mb-4">
        <div>
          <h1 className="h4 mb-1">Reservas</h1>
          <p className="text-secondary mb-0">{data?.meta.total ?? 0} reservas encontradas</p>
        </div>
        <div className="page-actions">
          {aiSettings?.data.reservationAssistantEnabled && <button type="button" className="btn btn-outline-primary" onClick={() => setChatOpen(true)}>Reservar con IA</button>}
          <button type="button" className="btn btn-primary" onClick={() => { clearError(); setCreateOpen(true); }}>
            + Nueva reserva
          </button>
        </div>
      </div>

      <FilterPanel onApply={applyFilters} activeCount={Object.values(appliedParams).filter(Boolean).length}>
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
              Filtrar
            </button>
      </FilterPanel>

      <div className="card shadow-sm">
        <div className="card-body p-0">
          <LoadState loading={loading} error={error} onRetry={reload} empty={reservations.length === 0} />
          {reservations.length > 0 && (
            <>
              <div className="table-responsive">
                <table className="table align-middle mb-0 responsive-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Habitación</th>
                      <th>Huésped</th>
                      <th>Período</th>
                      <th className="text-end">Total</th>
                      <th className="text-end">Saldo</th>
                      <th>Estado</th>
                      <th className="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Código"><strong>{r.code}</strong></td>
                        <td data-label="Habitación">{r.rooms?.length ? r.rooms.map((line) => line.room?.number ?? '—').join(', ') : r.room?.number ?? '—'}</td>
                        <td data-label="Huésped">
                          {r.guest ? `${r.guest.lastName}, ${r.guest.firstName}` : '—'}
                        </td>
                        <td data-label="Período">
                          {dateShort(r.checkIn)} → {dateShort(r.checkOut)}
                        </td>
                        <td data-label="Total" className="text-end">{money(r.totals.total)}</td>
                        <td data-label="Saldo" className={`text-end ${r.totals.balance > 0 ? 'text-danger' : 'text-success'}`}>
                          {money(r.totals.balance)}
                        </td>
                        <td data-label="Estado">
                          <span className="d-inline-flex align-items-center flex-wrap gap-2">
                            <StatusBadge status={r.status} />
                            <RefundBadge reservation={r} />
                            {r.source === 'PUBLIC_LINK' && (
                              <span
                                className={`badge rounded-pill ${r.status === 'PENDING' ? 'text-bg-info' : 'text-bg-light border'}`}
                                title={r.status === 'PENDING' ? 'El huésped envió el comprobante: hay que verificarlo' : 'Reserva enviada por el link de WhatsApp'}
                              >
                                {r.status === 'PENDING' ? 'Verificar pago' : 'WhatsApp'}
                              </span>
                            )}
                          </span>
                        </td>
                        <td data-label="Acciones" className="text-end table-actions">
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openDetail(r.id)}>
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-top">
                <PaginationBar meta={data?.meta} onChange={setPage} />
              </div>
            </>
          )}
        </div>
      </div>

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
