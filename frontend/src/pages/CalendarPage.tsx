import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { api, buildQuery } from '../api/client';
import { useApi } from '../api/useApi';
import type { CalendarCell, CalendarData, CalendarRoom, Reservation } from '../api/types';
import { LoadState } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { ReservationDetail } from '../components/ReservationDetail';
import { useApiError } from '../components/pagination';

const WEEKDAY_HEADERS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

const MAX_CHIPS = 2;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function daysSinceMonday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cursor = new Date(year, month, 1 - daysSinceMonday(first));
  const weeks: string[][] = [];
  while (cursor <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(isoOf(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
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

function roomSubtitle(room: CalendarRoom): string {
  return [room.name, room.typeName].filter(Boolean).join(' · ');
}

export function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());

  const weeks = monthGrid(year, month);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];
  const { data, loading, error, reload } = useApi<{ data: CalendarData }>(`/calendar${buildQuery({ from, to })}`);
  const cal = data?.data;

  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const activeRoom = cal?.rooms.find((room) => room.id === activeRoomId) ?? cal?.rooms[0];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const { error: apiError, handleError, clearError } = useApiError();

  const cellsByDay = new Map<string, CalendarCell>();
  if (cal && activeRoom) {
    activeRoom.cells.forEach((cell, i) => cellsByDay.set(cal.days[i], cell));
  }

  const activeIndex = cal?.rooms.findIndex((room) => room.id === activeRoom?.id) ?? -1;

  useEffect(() => {
    tabRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeIndex]);

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

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rooms = cal?.rooms ?? [];
    if (rooms.length === 0) return;
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % rooms.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + rooms.length) % rooms.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rooms.length - 1;
    else return;
    e.preventDefault();
    setActiveRoomId(rooms[next].id);
    tabRefs.current[next]?.focus();
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

      {cal && cal.rooms.length > 0 && activeRoom && (
        <div className="card shadow-sm">
          <div className="card-header p-0 cal-tabs-wrap">
            <ul className="nav nav-tabs cal-tabs" role="tablist" aria-label="Habitaciones">
              {cal.rooms.map((room, index) => {
                const active = room.id === activeRoom.id;
                return (
                  <li className="nav-item" key={room.id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      id={`cal-tab-${room.id}`}
                      aria-selected={active}
                      aria-controls={`cal-panel-${room.id}`}
                      tabIndex={active ? 0 : -1}
                      ref={(el) => {
                        tabRefs.current[index] = el;
                      }}
                      className={`nav-link ${active ? 'active' : ''}`}
                      onClick={() => setActiveRoomId(room.id)}
                      onKeyDown={(e) => onTabKeyDown(e, index)}
                    >
                      {room.number}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div
            className="card-body"
            role="tabpanel"
            id={`cal-panel-${activeRoom.id}`}
            aria-labelledby={`cal-tab-${activeRoom.id}`}
          >
            <div className="d-flex align-items-baseline gap-2 mb-2">
              <span className="fw-semibold">Habitación {activeRoom.number}</span>
              {roomSubtitle(activeRoom) && <small className="text-secondary">{roomSubtitle(activeRoom)}</small>}
            </div>

            <div className="table-responsive">
              <table className="table table-bordered cal-month mb-0">
                <thead>
                  <tr>
                    {WEEKDAY_HEADERS.map((label, i) => (
                      <th key={label} scope="col" className={`cal-weekend-head ${i > 4 ? 'cal-weekend' : ''}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week[0]}>
                      {week.map((dayIso) => {
                        const dayNumber = Number(dayIso.slice(8, 10));
                        const inMonth = dayIso.slice(0, 7) === isoOf(year, month, 1).slice(0, 7);
                        const isToday = dayIso === todayIso;
                        const weekday = daysSinceMonday(new Date(Number(dayIso.slice(0, 4)), Number(dayIso.slice(5, 7)) - 1, dayNumber));
                        const cell = cellsByDay.get(dayIso);
                        const cls = cell ? (STATUS_LABEL[cell.status]?.cls ?? 'cal-available') : 'cal-available';
                        const clickable = Boolean(cell && cell.reservations.length > 0);
                        const chips = clickable ? cell!.reservations.slice(0, MAX_CHIPS) : [];
                        const overflow = (cell?.reservations.length ?? 0) - chips.length;
                        return (
                          <td
                            key={dayIso}
                            className={`cal-day ${cls} ${weekday > 4 ? 'cal-weekend' : ''} ${inMonth ? '' : 'cal-outside'} ${isToday ? 'cal-today' : ''}`}
                            title={cell ? cellTooltip(cell, dayIso) : 'Disponible'}
                          >
                            <span className="cal-daynum">{dayNumber}</span>
                            {chips.map((r) => (
                              <button
                                type="button"
                                key={r.id}
                                className="cal-chip"
                                onClick={() => openDetail(r.id)}
                                title={`${r.code} — ${r.guestName} (${r.checkIn} → ${r.checkOut})`}
                              >
                                {cell?.status === 'TURNOVER' && (
                                  <span className="cal-chip-mark">{r.checkOut === dayIso ? '↓' : '↑'}</span>
                                )}
                                <span className="cal-chip-guest">{r.guestName}</span>
                                <span className="cal-chip-code">{r.code}</span>
                              </button>
                            ))}
                            {overflow > 0 && <span className="cal-chip-more">+{overflow}</span>}
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

      <Modal
        open={detailId !== null && !selected && !detailLoading && !!apiError}
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

      <Modal open={detailId !== null && detailLoading} title="Reserva" onClose={handleCloseDetail}>
        <p className="text-secondary mb-0">Cargando detalle de la reserva…</p>
      </Modal>

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
