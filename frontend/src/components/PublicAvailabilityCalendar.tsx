import { useEffect, useState } from 'react';
import { ApiError, api, buildQuery } from '../api/client';
import { ErrorBanner, Spinner } from './Feedback';
import { dateShort } from '../lib/format';
import { calendarIso as iso, shiftCalendarDay as shift, calendarStayError } from '../lib/availabilityCalendar';
import type { PublicCalendarRoom } from '../api/types';

interface PublicCalendar {
  days: string[];
  rooms: PublicCalendarRoom[];
}

const hotelToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

export function PublicAvailabilityCalendar({ slug, roomTypeId, roomTypes, onTypeChange, onSelect }: {
  slug: string;
  roomTypeId: string;
  roomTypes: { id: number; name: string }[];
  onTypeChange: (value: string) => void;
  onSelect: (checkIn: string, checkOut: string, room: PublicCalendarRoom) => void;
}) {
  const today = hotelToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [data, setData] = useState<PublicCalendar | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [roomId, setRoomId] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const first = `${month}-01`;
  const monthDate = new Date(`${first}T00:00:00Z`);
  const last = iso(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)));
  const from = shift(first, -30);
  const to = shift(last, 1);
  const key = `${slug}:${roomTypeId}:${month}:${retry}`;
  const loading = !!roomTypeId && loadedKey !== key;

  useEffect(() => {
    if (!roomTypeId) return;
    const controller = new AbortController();
    api<{ data: PublicCalendar }>(`/public/availability/${encodeURIComponent(slug)}/calendar${buildQuery({ roomTypeId, from, to })}`, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response.data);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el calendario.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedKey(key); });
    return () => controller.abort();
  }, [slug, roomTypeId, from, to, key]);

  const room = data?.rooms.find((item) => item.id === roomId) ?? data?.rooms[0];
  const available = new Map(data?.days.map((day, index) => [day, room?.cells[index]?.available ?? false]));
  const canContinue = !!start && !!end && !calendarStayError(start, end, available);
  const gridStart = shift(first, -((monthDate.getUTCDay() + 6) % 7));
  const gridLength = Math.ceil((Number(last.slice(8)) + (monthDate.getUTCDay() + 6) % 7) / 7) * 7;
  const days = Array.from({ length: gridLength }, (_, index) => shift(gridStart, index));

  function resetSelection() {
    setStart('');
    setEnd('');
    setSelectionError(null);
  }

  function selectDay(day: string) {
    setSelectionError(null);
    if (!start || end || day <= start) {
      if (!available.get(day)) return;
      setStart(day);
      setEnd('');
      return;
    }
    const validationError = calendarStayError(start, day, available);
    if (validationError) {
      setSelectionError(validationError);
      return;
    }
    setEnd(day);
  }

  function changeMonth(offset: number) {
    const next = iso(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + offset, 1))).slice(0, 7);
    setMonth(next);
    if (start && (next > shift(start, 30).slice(0, 7) || next < start.slice(0, 7))) resetSelection();
  }

  return <section aria-label="Calendario público de disponibilidad">
    <label className="form-label" htmlFor="calendar-room-type">Tipo de habitación</label>
    <select id="calendar-room-type" className="form-select mb-3" value={roomTypeId} onChange={(event) => {
      onTypeChange(event.target.value);
      setRoomId(null);
      resetSelection();
    }}>
      <option value="">Seleccioná un tipo</option>
      {roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
    </select>
    {!roomTypeId && <p className="text-secondary">Elegí un tipo para ver sus habitaciones y fechas disponibles.</p>}
    {!!roomTypeId && <>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <button type="button" className="btn btn-outline-secondary" aria-label="Mes anterior" disabled={month <= today.slice(0, 7)} onClick={() => changeMonth(-1)}>‹</button>
        <span className="fw-semibold text-capitalize" aria-live="polite">{monthDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
        <button type="button" className="btn btn-outline-secondary" aria-label="Mes siguiente" onClick={() => changeMonth(1)}>›</button>
        <button type="button" className="btn btn-outline-primary" onClick={() => { setMonth(today.slice(0, 7)); resetSelection(); }}>Hoy</button>
      </div>
      {loading ? <Spinner /> : error ? <><ErrorBanner message={error} /><button type="button" className="btn btn-outline-primary" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></> : data && <>
        {data.rooms.length === 0 ? <p className="text-secondary">No hay habitaciones habilitadas de este tipo.</p> : room && <>
          <div className="d-flex gap-2 overflow-auto pb-2 mb-3" role="group" aria-label="Habitaciones">
            {data.rooms.map((item) => <button key={item.id} type="button" className={`btn text-nowrap ${item.id === room.id ? 'btn-primary' : 'btn-outline-primary'}`} aria-pressed={item.id === room.id} onClick={() => { setRoomId(item.id); resetSelection(); }}>
              {item.number}{item.name ? ` · ${item.name}` : ''}
            </button>)}
          </div>
          <h2 className="h6">Habitación {room.number}{room.name ? ` · ${room.name}` : ''}</h2>
          <p className="small text-secondary">{room.typeName} · Elegí entrada y luego salida. La disponibilidad corresponde a cada noche.</p>
          <div className="d-flex flex-wrap gap-3 small mb-3"><span>● Disponible</span><span className="text-secondary">× Sin disponibilidad</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
            {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((day) => <div key={day} className="text-center small fw-semibold">{day}</div>)}
            {days.map((day) => {
              const inMonth = day.slice(0, 7) === month;
              const free = available.get(day);
              const selected = day === start || day === end || (!!start && !!end && day > start && day < end);
              const canCheckOut = !!start && !end && day > start;
              const disabled = !inMonth || day < today || (!free && !canCheckOut);
              return <button key={day} type="button" disabled={disabled} className={`btn p-1 ${selected ? 'btn-primary' : free && inMonth && day >= today ? 'btn-outline-success' : 'btn-light text-secondary'}`}
                style={{ minHeight: 52, opacity: inMonth ? 1 : 0.35 }} aria-pressed={selected} aria-current={day === today ? 'date' : undefined}
                aria-label={`${dateShort(day)}: ${free ? 'disponible' : 'sin disponibilidad'}${day === start ? ', entrada' : day === end ? ', salida' : ''}`}
                onClick={() => selectDay(day)}>
                <span className="d-block">{Number(day.slice(8))}</span><span className="d-block small" aria-hidden="true">{inMonth && day >= today ? free ? '●' : '×' : '\u00a0'}</span>
              </button>;
            })}
          </div>
          <div className="mt-3" aria-live="polite">
            {start && <p className="small mb-2">Entrada: <strong>{dateShort(start)}</strong>{end ? <> · Salida: <strong>{dateShort(end)}</strong></> : ' · Ahora elegí la fecha de salida.'}</p>}
            {selectionError && <ErrorBanner message={selectionError} />}
          </div>
          {start && <button type="button" className="btn btn-link px-0" onClick={resetSelection}>Limpiar fechas</button>}
          <button type="button" className="btn btn-primary w-100 mt-2" disabled={!canContinue} onClick={() => { if (canContinue) onSelect(start, end, room); }}>Confirmar habitación y fechas</button>
          <p className="small text-secondary mt-3 mb-0">Continuarás con esta habitación y estas fechas. En el siguiente paso indicarás cuántas personas se alojan y podrás agregar servicios extra.</p>
        </>}
      </>}
    </>}
  </section>;
}
