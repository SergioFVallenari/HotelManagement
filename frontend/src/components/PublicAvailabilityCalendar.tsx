import { useEffect, useState } from 'react';
import { ApiError, api, buildQuery } from '../api/client';
import { ErrorBanner } from './Feedback';
import { ContentSkeleton } from './Skeleton';
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
  const arrivals = new Map(data?.days.map((day, index) => [day, room?.cells[index]?.arrivals ?? false]));
  const departures = new Map(data?.days.map((day, index) => [day, room?.cells[index]?.departures ?? false]));
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

  return <section className="availability-calendar" aria-label="Calendario público de disponibilidad">
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
      {loading ? <ContentSkeleton variant="calendar" /> : error ? <><ErrorBanner message={error} /><button type="button" className="btn btn-outline-primary" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></> : data && <>
        {data.rooms.length === 0 ? <p className="text-secondary">No hay habitaciones habilitadas de este tipo.</p> : room && <>
          <h2 className="h6 fw-bold">Seleccioná tu habitación</h2>
          <div className="availability-room-list mb-3" role="group" aria-label="Habitaciones">
            {data.rooms.map((item) => <button key={item.id} type="button" className={`availability-room ${item.id === room.id ? 'is-selected' : ''}`} aria-pressed={item.id === room.id} onClick={() => { setRoomId(item.id); resetSelection(); }}>
              <strong>{item.name || `Habitación ${item.number}`}</strong><span>Hasta {item.capacity} huéspedes</span>
            </button>)}
          </div>
          <div className="availability-calendar-layout"><div className="availability-calendar-panel">
          <div className="availability-month">
            <div><h3 className="availability-month-title text-capitalize" aria-live="polite">{monthDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button type="button" className="availability-today-link" onClick={() => { setMonth(today.slice(0, 7)); resetSelection(); }} disabled={month === today.slice(0, 7)}>Ir a hoy</button></div>
            <div className="availability-month-actions"><button type="button" aria-label="Mes anterior" disabled={month <= today.slice(0, 7)} onClick={() => changeMonth(-1)}>‹</button><button type="button" aria-label="Mes siguiente" onClick={() => changeMonth(1)}>›</button></div>
          </div>
          <p className="availability-calendar-hint">{room.typeName} · Verde: libre. Rojo: ocupada. Rojo/verde: salen y queda libre. Verde/rojo: entran ese día. Rojo/rojo con barra: salen y entran otros huéspedes. Elegí entrada y después salida.</p>
          <div className="availability-calendar-grid">
            {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((day) => <div key={day} className="availability-weekday">{day}</div>)}
            {days.map((day) => {
              const inMonth = day.slice(0, 7) === month;
              const free = available.get(day);
              const arrival = arrivals.get(day);
              const departure = departures.get(day);
              const selected = day === start || day === end || (!!start && !!end && day > start && day < end);
              const canCheckOut = !!start && !end && day > start && !calendarStayError(start, day, available);
              const disabled = !inMonth || day < today || (!free && !canCheckOut);
              const status = !inMonth || day < today ? 'outside' : free ? 'free' : 'occupied';
              const transition = arrival && departure ? 'turnover' : arrival ? 'arrival' : departure ? 'departure' : '';
              return <button key={day} type="button" disabled={disabled} className={`availability-day is-${status}${selected ? ' is-selected' : ''}${transition && inMonth && day >= today ? ` is-${transition}` : ''}`}
                aria-pressed={selected} aria-current={day === today ? 'date' : undefined}
                aria-label={`${dateShort(day)}: ${free ? 'noche disponible' : 'noche ocupada'}${departure ? ', salen huéspedes' : ''}${arrival ? ', entran huéspedes' : ''}${!free && canCheckOut ? ', podés salir por la mañana sin alojarte esa noche' : ''}${day === start ? ', entrada seleccionada' : day === end ? ', salida seleccionada' : ''}`}
                onClick={() => selectDay(day)}>
                <span>{Number(day.slice(8))}</span><span className="availability-day-mark" aria-hidden="true">{status === 'outside' ? '\u00a0' : '●'}</span>
              </button>;
            })}
          </div>
          <div className="availability-calendar-legend"><span><i className="is-free" />Libre</span><span><i className="is-occupied" />Ocupada</span><span><i className="is-transition" />Entrada y salida</span></div>
          </div><div className="availability-selection"><h3 className="h6 fw-bold">Tu selección</h3><div className="availability-selection-card" aria-live="polite">
            <strong>{room.name || `Habitación ${room.number}`}</strong>
            {start && <p className="small mb-2">Entrada: <strong>{dateShort(start)}</strong>{end ? <> · Última noche: <strong>{dateShort(shift(end, -1))}</strong> · Salida: <strong>{dateShort(end)}</strong> (por la mañana)</> : ' · Ahora elegí la fecha de salida (no se duerme esa noche).'}</p>}
            {!start && <p className="small text-secondary mb-0">Primero elegí la entrada en el calendario. Después, la salida.</p>}
            {selectionError && <ErrorBanner message={selectionError} />}
          </div>
          {start && <button type="button" className="btn btn-link px-0" onClick={resetSelection}>Limpiar fechas</button>}
          <button type="button" className="btn btn-primary w-100 mt-2" disabled={!canContinue} onClick={() => { if (canContinue) onSelect(start, end, room); }}>Continuar con mi reserva</button>
          </div></div>
        </>}
      </>}
    </>}
  </section>;
}
