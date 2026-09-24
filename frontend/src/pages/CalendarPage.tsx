import { useState } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { CalendarData, CalendarCell, Reservation } from '../api/types';
import { LoadState } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { ReservationDetail } from '../components/ReservationDetail';
import { useApiError } from '../components/pagination';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function startOfMonth(year: number, month: number): string {
  return `${year}-${pad(month + 1)}-01`;
}

function endOfMonth(year: number, month: number): string {
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad(month + 1)}-${pad(last)}`;
}

function weekdayLabel(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString('es-AR', { weekday: 'narrow' });
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  AVAILABLE: { label: 'Disponible', cls: 'cal-available' },
  OCCUPIED: { label: 'Ocupado', cls: 'cal-occupied' },
  TURNOVER: { label: 'Check-out + check-in', cls: 'cal-turnover' },
};

function cellTooltip(cell: CalendarCell, day: string): string {
  if (cell.status === 'AVAILABLE') return 'Disponible';
  if (cell.status === 'OCCUPIED') {
    return cell.reservations.map((r) => `${r.code} — ${r.guestName}`).join('\n');
  }
  return cell.reservations
    .map((r) => `${r.code} ${r.checkOut === day ? '(check-out)' : '(check-in)'} — ${r.guestName}`)
    .join('\n');
}

export function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const from = startOfMonth(year, month);
  const to = endOfMonth(year, month);
  const { data, loading, error, reload } = useApi<{ data: CalendarData }>(`/calendar${buildQuery({ from, to })}`);
  const cal = data?.data;

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const { error: apiError, handleError, clearError } = useApiError();

  function changeMonth(offset: number) {
    const d = new Date(year, month + offset, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function goToday() {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth());
  }

  async function openDetail(id: number) {
    setDetailId(id);
    setDetailLoading(true);
    setSelected(null);
    clearError();
    try {
      const result = await api<{ data: Reservation }>(`/reservations/${id}`);
      setSelected(result.data);
    } catch (err) {
      handleError(err);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleDetailChanged(updated: Reservation) {
    setSelected(updated);
    clearError();
    reload();
  }

  function handleDetailError(err: unknown) {
    handleError(err);
  }

  function handleCloseDetail() {
    setDetailId(null);
    setSelected(null);
    clearError();
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="h4 mb-1">Calendario de disponibilidad</h1>
          <p className="text-secondary mb-0">Ocupación por habitación y día del mes</p>
        </div>
        <div className="btn-toolbar gap-2" role="group" aria-label="Navegación del mes">
          <div className="input-group" style={{ width: 'auto' }}>
            <button type="button" className="btn btn-outline-secondary" onClick={() => changeMonth(-1)} aria-label="Mes anterior">
              ‹
            </button>
            <span className="input-group-text fw-semibold">
              {new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" className="btn btn-outline-secondary" onClick={() => changeMonth(1)} aria-label="Mes siguiente">
              ›
            </button>
          </div>
          <button type="button" className="btn btn-outline-primary" onClick={goToday}>
            Hoy
          </button>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-3 mb-3">
        {(['AVAILABLE', 'OCCUPIED', 'TURNOVER'] as const).map((s) => (
          <span key={s} className="legend-chip">
            <span className={`cal-swatch ${STATUS_LABEL[s].cls}`} /> {STATUS_LABEL[s].label}
          </span>
        ))}
      </div>

      <LoadState loading={loading} error={error} onRetry={reload} empty={cal?.rooms.length === 0} />

      {cal && cal.rooms.length > 0 && (
        <div className="card shadow-sm">
          <div className="card-body p-0">
            <div className="calendar-scroll">
              <table className="table table-bordered table-sm calendar-table mb-0">
                <thead>
                  <tr>
                    <th className="cal-corner">Habitación</th>
                    {cal.days.map((iso) => {
                      const [, m, d] = iso.split('-').map(Number);
                      const isToday = iso === todayIso;
                      const weekday = new Date(year, m - 1, d).getDay();
                      const isWeekend = weekday === 0 || weekday === 6;
                      return (
                        <th
                          key={iso}
                          className={`cal-day-head ${isWeekend ? 'cal-weekend' : ''} ${isToday ? 'cal-today-head' : ''}`}
                        >
                          <span className="cal-weekday">{weekdayLabel(year, m - 1, d)}</span>
                          <span className="cal-daynum">{d}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {cal.rooms.map((room) => (
                    <tr key={room.id}>
                      <td className="cal-room-col">
                        <strong>{room.number}</strong>
                        <small>{room.name ?? room.typeName ?? ''}</small>
                      </td>
                      {room.cells.map((cell, i) => {
                        const dayIso = cal.days[i];
                        const isToday = dayIso === todayIso;
                        const cls = STATUS_LABEL[cell.status]?.cls ?? 'cal-available';
                        const clickable = cell.status === 'OCCUPIED' && cell.reservations.length > 0;
                        return (
                          <td
                            key={dayIso}
                            className={`cal-cell ${cls} ${isToday ? 'cal-today' : ''} ${clickable ? 'cal-clickable' : ''}`}
                            title={cellTooltip(cell, dayIso)}
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            onClick={clickable ? () => openDetail(cell.reservations[0].id) : undefined}
                            onKeyDown={
                              clickable
                                ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      openDetail(cell.reservations[0].id);
                                    }
                                  }
                                : undefined
                            }
                          >
                            {cell.status === 'TURNOVER' ? <span className="cal-turnover-mark" /> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {detailId !== null && !selected && !detailLoading && apiError && (
        <Modal
          open
          title="Reserva"
          onClose={handleCloseDetail}
          error={apiError}
          onDismissError={clearError}
        >
          <p className="text-secondary mb-0">No se pudo cargar el detalle de la reserva.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={handleCloseDetail}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {detailId !== null && detailLoading && (
        <Modal open title="Reserva" onClose={handleCloseDetail}>
          <p className="text-secondary mb-0">Cargando detalle de la reserva…</p>
        </Modal>
      )}

      <ReservationDetail
        reservation={selected}
        onClose={handleCloseDetail}
        onChanged={handleDetailChanged}
        onError={handleDetailError}
        error={apiError}
        onDismissError={clearError}
      />
    </div>
  );
}