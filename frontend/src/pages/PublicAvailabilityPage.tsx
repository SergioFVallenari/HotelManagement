import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api, buildQuery } from '../api/client';
import type { PublicAvailability, PublicBookingPageConfig } from '../api/types';
import { ErrorBanner, Spinner } from '../components/Feedback';
import { dateShort, money } from '../lib/format';
import { bookingThemeFromConfig, bookingThemeStyle } from '../lib/bookingTheme';
import { buildAvailabilityMessage } from '../lib/availabilityShare';

const BOOKING_SLUG = import.meta.env.VITE_PUBLIC_BOOKING_SLUG;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

export function PublicAvailabilityPage() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const bookingSlug = routeSlug ?? BOOKING_SLUG;
  const [pageConfig, setPageConfig] = useState<PublicBookingPageConfig | null>(null);
  const [loadedConfigSlug, setLoadedConfigSlug] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [persons, setPersons] = useState(2);
  const [roomCount, setRoomCount] = useState('');
  const [roomPersons, setRoomPersons] = useState<number[]>([]);
  const [includeExtraBeds, setIncludeExtraBeds] = useState(false);
  const [result, setResult] = useState<PublicAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ data: PublicBookingPageConfig }>(`/public/availability/${encodeURIComponent(bookingSlug)}/config`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setPageConfig(response.data);
          setPersons((current) => Math.max(1, Math.min(current, response.data.hotel.maxAvailabilityPersons)));
          setRoomCount('');
          setRoomPersons([]);
          setIncludeExtraBeds(false);
          setResult(null);
          setError(null);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setPageConfig(null);
          setError(err instanceof ApiError ? err.message : 'No se pudo cargar la página del alojamiento.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedConfigSlug(bookingSlug);
      });
    return () => controller.abort();
  }, [bookingSlug]);

  function updateDistribution(total: number, count: string) {
    const length = Number(count);
    setRoomPersons(Array.from({ length }, (_, index) => Math.floor(total / length) + (index < total % length ? 1 : 0)));
  }

  const distributionTotal = roomPersons.reduce((sum, count) => sum + count, 0);
  const maxPersons = includeExtraBeds && pageConfig?.hotel.publicExtraBedsEnabled ? pageConfig.hotel.maxAvailabilityPersonsWithExtraBeds : pageConfig?.hotel.maxAvailabilityPersons ?? 0;
  const distributionValid = !roomCount || (roomPersons.length === Number(roomCount) && distributionTotal === persons && roomPersons.every((count) => Number.isInteger(count) && count > 0));

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!pageConfig || persons > maxPersons) return;
    if (!distributionValid) {
      setError('La suma de personas por habitación debe coincidir con el total de personas.');
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const query = buildQuery({ checkIn, checkOut, persons, roomCount: roomCount || undefined, roomPersons: roomCount ? roomPersons.join(',') : undefined, includeExtraBeds: includeExtraBeds ? 'true' : undefined });
      const response = await api<{ data: PublicAvailability }>(
        `/public/availability/${encodeURIComponent(bookingSlug)}${query}`,
      );
      setResult(response.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo consultar la disponibilidad. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const contact = result?.hotel.whatsapp || result?.hotel.phone;
  const contactDigits = contact?.replace(/\D/g, '');
  const whatsappMessage = result ? buildAvailabilityMessage(result) : '';
  const theme = bookingThemeFromConfig({ bookingTheme: pageConfig?.hotel.bookingTheme ?? result?.hotel.bookingTheme });
  const themeStyle = bookingThemeStyle(theme);

  if (loadedConfigSlug !== bookingSlug) {
    return <div className="login-screen"><Spinner /></div>;
  }

  if (!pageConfig) {
    return <div className="login-screen"><div className="login-card"><ErrorBanner message={error ?? 'No se pudo cargar la página del alojamiento.'} /></div></div>;
  }

  return (
    <div className="login-screen booking-screen public-booking-theme align-items-center" style={themeStyle}>
      <main className="booking-card">
        <div className="login-brand">
          <h1>{pageConfig?.hotel.name ?? result?.hotel.name ?? 'Consultar disponibilidad'}</h1>
          <p className="text-secondary mb-0">Encontrá habitaciones para tu estadía</p>
        </div>

        <form onSubmit={search}>
          <fieldset disabled={loading}>
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label" htmlFor="availability-checkin">Check-in</label>
                <input id="availability-checkin" className="form-control" type="date" min={today} value={checkIn}
                  onChange={(event) => { setCheckIn(event.target.value); setResult(null); }} required />
              </div>
              <div className="col-6">
                <label className="form-label" htmlFor="availability-checkout">Check-out</label>
                <input id="availability-checkout" className="form-control" type="date" min={checkIn || today} value={checkOut}
                  onChange={(event) => { setCheckOut(event.target.value); setResult(null); }} required />
              </div>
              <div className="col-6">
                <label className="form-label" htmlFor="availability-persons">Personas</label>
                <select id="availability-persons" className="form-select" value={persons}
                  disabled={maxPersons === 0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    const count = Number(roomCount) > value ? '' : roomCount;
                    setPersons(value);
                    setRoomCount(count);
                    updateDistribution(value, count);
                    setResult(null);
                  }}>
                  {Array.from({ length: maxPersons }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>{count} {count === 1 ? 'persona' : 'personas'}</option>
                  ))}
                </select>
                {maxPersons === 0 && <div className="form-text">No hay habitaciones habilitadas para consultar disponibilidad.</div>}
              </div>
              <div className="col-6">
                <label className="form-label" htmlFor="availability-rooms">Habitaciones</label>
                <select id="availability-rooms" className="form-select" value={roomCount} disabled={pageConfig.hotel.roomCount === 0} onChange={(event) => { setRoomCount(event.target.value); updateDistribution(persons, event.target.value); setResult(null); }}>
                  <option value="">Combinar automáticamente</option>
                  {Array.from({ length: Math.min(persons, pageConfig.hotel.roomCount, 100) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? 'habitación' : 'habitaciones'}</option>)}
                </select>
              </div>
            </div>
            {pageConfig.hotel.publicExtraBedsEnabled && (
              <div className="form-check mt-3">
                <input id="availability-extra-beds" className="form-check-input" type="checkbox" checked={includeExtraBeds} onChange={(event) => {
                  const checked = event.target.checked;
                  setIncludeExtraBeds(checked);
                  const limit = checked ? pageConfig.hotel.maxAvailabilityPersonsWithExtraBeds : pageConfig.hotel.maxAvailabilityPersons;
                  const total = Math.max(1, Math.min(persons, limit));
                  const count = Number(roomCount) > total ? '' : roomCount;
                  setPersons(total);
                  setRoomCount(count);
                  if (total !== persons || count !== roomCount) updateDistribution(total, count);
                  setResult(null);
                }} />
                <label htmlFor="availability-extra-beds" className="form-check-label">Acepto agregar camas extra</label>
                <div className="form-text">Solo se agregarán si hacen falta para la distribución propuesta. El precio se incluye en el total.</div>
              </div>
            )}
            {roomCount && (
              <fieldset className="mt-3">
                <legend className="h6">Personas por habitación</legend>
                <div className="row g-3">
                  {roomPersons.map((count, index) => (
                    <div className="col-6" key={index}>
                      <label className="form-label" htmlFor={`availability-room-${index}`}>Habitación {index + 1}</label>
                      <input id={`availability-room-${index}`} className="form-control" type="number" min={1} max={persons - Number(roomCount) + 1} step={1} required value={count || ''}
                        onChange={(event) => { setRoomPersons((current) => current.map((value, position) => position === index ? Number(event.target.value) : value)); setResult(null); }} />
                    </div>
                  ))}
                </div>
                <p className={`small mt-2 mb-0 ${distributionValid ? 'text-secondary' : 'text-danger'}`} aria-live="polite">
                  {distributionTotal} de {persons} personas distribuidas.{!distributionValid && ' La suma debe coincidir con el total y cada habitación debe tener al menos una persona.'}
                </p>
              </fieldset>
            )}
            {error && <div className="mt-3"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
            <button type="submit" className="btn btn-primary w-100 mt-4" disabled={loading || maxPersons === 0 || !distributionValid}>
              {loading ? 'Buscando…' : 'Consultar disponibilidad'}
            </button>
          </fieldset>
        </form>

        {loading && <div className="mt-4"><Spinner /></div>}
        {result && !loading && (
          <section className="mt-4" aria-live="polite">
            <div className="card shadow-sm mb-3">
              <div className="card-body">
                <h2 className="h5 mb-1">{result.availableRoomCount} {result.availableRoomCount === 1 ? 'habitación disponible' : 'habitaciones disponibles'} · Hasta {result.availableRoomCapacity} personas por habitación sin camas extra</h2>
                <p className="small text-secondary mb-0">Libres durante toda la estadía: {dateShort(result.stay.checkIn)} → {dateShort(result.stay.checkOut)}.</p>
              </div>
            </div>
            <h2 className="h6">Opciones para {result.stay.nights} {result.stay.nights === 1 ? 'noche' : 'noches'}</h2>
            {result.combination && (result.combination.roomCount > 1 || result.stay.includesExtraBeds) && (
              <article className="card shadow-sm mb-3">
                <div className="card-body">
                  <h3 className="h6">Hay disponibilidad para {result.combination.persons} personas en {result.combination.roomCount} {result.combination.roomCount === 1 ? 'habitación' : 'habitaciones'}</h3>
                  <p className="small text-secondary">{roomCount ? 'Respetamos las personas por habitación elegidas y buscamos el menor precio.' : 'Distribución sugerida: priorizamos la menor cantidad de habitaciones y luego el menor precio.'}</p>
                  {result.combination.rooms.map((room, index) => (
                    <div className="d-flex justify-content-between gap-3 border-bottom py-2" key={index}>
                      <div><strong>Habitación {index + 1}: {room.roomType}</strong><div className="small text-secondary">{room.persons} {room.persons === 1 ? 'persona' : 'personas'} · Capacidad base: {room.capacity}{room.extraBeds ? ` + ${room.extraBeds} cama(s) extra` : ''}</div><div className="small text-secondary">Amenities: {room?.amenities?.join(', ') || 'Ninguno'}</div></div>
                      <span className="text-nowrap">{money(room.total)}</span>
                    </div>
                  ))}
                  {!!result.combination.extraBeds && <>
                    <div className="d-flex justify-content-between gap-3 mt-3"><span>Habitaciones por estadía</span><span>{money(result.combination.roomTotal)}</span></div>
                    <div className="d-flex justify-content-between gap-3"><span>{result.combination.extraBeds} cama(s) extra · {result.combination.extraBedService?.name}</span><span>{money(result.combination.extraBedsTotal)}</span></div>
                  </>}
                  <div className="d-flex justify-content-between gap-3 mt-3 fw-semibold"><span>Total por estadía</span><span>{money(result.combination.total)}</span></div>
                </div>
              </article>
            )}
            {!result.combination && result.options.length === 0 ? (
              <p className="text-secondary">{result.availableRoomCount === 0 ? 'No encontramos disponibilidad para esas fechas. Probá con otras fechas o consultanos.' : 'No encontramos una combinación para la cantidad de personas y habitaciones solicitada. Probá con otra distribución o consultanos.'}</p>
            ) : result.options.map((option) => (
              <article className="card shadow-sm mb-2" key={option.roomType}>
                <div className="card-body d-flex justify-content-between align-items-center gap-3">
                  <div><strong>{option.roomType}</strong><div className="small text-secondary">Hasta {option.capacity} personas · {option.available} disponible(s)</div></div>
                  <div className="text-end"><strong>{money(option.total)}</strong><div className="small text-secondary">por estadía</div></div>
                </div>
              </article>
            ))}
            {contactDigits && (
              <a className="btn btn-success w-100 mt-2" href={result.hotel.whatsapp ? `https://wa.me/${contactDigits}?text=${encodeURIComponent(whatsappMessage)}` : `tel:${contactDigits}`}
                target={result.hotel.whatsapp ? '_blank' : undefined} rel="noreferrer">
                {result.hotel.whatsapp ? 'Reservar por WhatsApp' : 'Llamar al hotel'}
              </a>
            )}
            <p className="small text-secondary mt-3 mb-0">La disponibilidad y los precios se confirman al gestionar la solicitud con el hotel.</p>
          </section>
        )}
      </main>
    </div>
  );
}
