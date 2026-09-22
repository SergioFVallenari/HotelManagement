import { useState } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { Page, Reservation } from '../api/types';
import { LoadState } from '../components/Feedback';
import { StatusBadge } from '../components/Badge';
import { ReservationForm } from '../components/ReservationForm';
import { ReservationDetail } from '../components/ReservationDetail';
import { useApiError, PaginationBar } from '../components/pagination';
import { money } from '../lib/format';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activas' },
  { value: 'RESERVED', label: 'Reservada' },
  { value: 'CHECKED_IN', label: 'Check-in' },
  { value: 'CHECKED_OUT', label: 'Check-out' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

export function ReservationsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedParams, setAppliedParams] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const query = buildQuery({ search: appliedParams.search, status: appliedParams.status, from: appliedParams.from, to: appliedParams.to, page });
  const { data, loading, error, reload } = useApi<Page<Reservation>>(`/reservations${query}`);

  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { error: apiError, handleError } = useApiError();

  const reservations = data?.data ?? [];

  function applyFilters() {
    setPage(1);
    setAppliedParams({
      search: search.trim() || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
    } as Record<string, string>);
  }

  async function openDetail(id: number) {
    setDetailId(id);
    setSelected(null);
    try {
      const result = await api<{ data: Reservation }>(`/reservations/${id}`);
      setSelected(result.data);
    } catch (err) {
      handleError(err);
      setDetailId(null);
    }
  }

  function handleChanged(updated: Reservation) {
    setSelected(updated);
    reload();
  }

  async function handleDetailChanged(updated: Reservation) {
    setSelected(updated);
    reload();
    if (updated.id !== detailId) setDetailId(updated.id);
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Reservas</h1>
          <p className="text-secondary mb-0">{data?.meta.total ?? 0} reservas encontradas</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Nueva reserva
        </button>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body py-3">
          <div className="filter-row">
            <input
              placeholder="Buscar por código, huésped o habitación…"
              className="form-control"
              style={{ minWidth: 220, flex: '1 1 auto' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="form-select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="field-inline">
              <span className="text-secondary small">Desde</span>
              <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field-inline">
              <span className="text-secondary small">Hasta</span>
              <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" onClick={applyFilters}>
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {apiError && <LoadState loading={false} error={apiError} onRetry={reload} />}

      <div className="card shadow-sm">
        <div className="card-body p-0">
          <LoadState loading={loading} error={error} onRetry={reload} empty={reservations.length === 0} />
          {reservations.length > 0 && (
            <>
              <div className="table-responsive">
                <table className="table align-middle mb-0">
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
                        <td><strong>{r.code}</strong></td>
                        <td>{r.room?.number ?? r.roomId}</td>
                        <td>
                          {r.guest ? `${r.guest.lastName}, ${r.guest.firstName}` : `#${r.guestId}`}
                        </td>
                        <td>
                          {r.checkIn} → {r.checkOut}
                        </td>
                        <td className="text-end">{money(r.totals.total)}</td>
                        <td className={`text-end ${r.totals.balance > 0 ? 'text-danger' : 'text-success'}`}>
                          {money(r.totals.balance)}
                        </td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="text-end">
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

      <ReservationForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleChanged}
        onError={handleError}
      />

      <ReservationDetail
        reservation={selected}
        onClose={() => setDetailId(null)}
        onChanged={handleDetailChanged}
        onError={handleError}
      />
    </div>
  );
}