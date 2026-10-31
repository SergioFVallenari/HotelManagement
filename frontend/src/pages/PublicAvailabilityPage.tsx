import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api, buildQuery } from '../api/client';
import type { PublicAvailability, PublicBookingPageConfig } from '../api/types';
import { ErrorBanner, Spinner } from '../components/Feedback';
import { dateShort, money } from '../lib/format';
import { bookingThemeFromConfig, bookingThemeStyle } from '../lib/bookingTheme';

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
  const [result, setResult] = useState<PublicAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ data: PublicBookingPageConfig }>(`/public/availability/${encodeURIComponent(bookingSlug)}/config`)
      .then((response) => {
        if (alive) {
          setPageConfig(response.data);
          setPersons((current) => Math.max(1, Math.min(current, response.data.hotel.maxAvailabilityPersons)));
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) {
          setPageConfig(null);
          setError(err instanceof ApiError ? err.message : 'No se pudo cargar la página del alojamiento.');
        }
      })
      .finally(() => {
        if (alive) setLoadedConfigSlug(bookingSlug);
      });
    return () => { alive = false; };
  }, [bookingSlug]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!pageConfig || persons > pageConfig.hotel.maxAvailabilityPersons) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const query = buildQuery({ checkIn, checkOut, persons, roomCount: roomCount || undefined });
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
  const whatsappMessage = result ? [
    `¡Hola! Quisiera reservar en ${result.hotel.name}.`,
    `Check-in: ${dateShort(result.stay.checkIn)}`,
    `Check-out: ${dateShort(result.stay.checkOut)}`,
    `Personas: ${result.stay.persons}`,
    ...(result.combination ? [`Habitaciones: ${result.combination.roomCount}`, ...result.combination.rooms.map((room, index) => `Habitación ${index + 1}: ${room.roomType}, ${room.persons} personas`)] : []),
    '¿Me ayudan a gestionar la reserva?',
  ].join('\n') : '';
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
                disabled={pageConfig.hotel.maxAvailabilityPersons === 0}
                onChange={(event) => { const value = Number(event.target.value); setPersons(value); if (Number(roomCount) > value) setRoomCount(''); setResult(null); }}>
                {Array.from({ length: pageConfig.hotel.maxAvailabilityPersons }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{count} {count === 1 ? 'persona' : 'personas'}</option>
                ))}
              </select>
              {pageConfig.hotel.maxAvailabilityPersons === 0 && <div className="form-text">No hay habitaciones habilitadas para consultar disponibilidad.</div>}
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="availability-rooms">Habitaciones</label>
              <select id="availability-rooms" className="form-select" value={roomCount} onChange={(event) => { setRoomCount(event.target.value); setResult(null); }}>
                <option value="">Combinar automáticamente</option>
                {Array.from({ length: Math.min(persons, 100) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} habitación(es)</option>)}
              </select>
            </div>
          </div>
          {error && <div className="mt-3"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
          <button type="submit" className="btn btn-primary w-100 mt-4" disabled={loading || pageConfig.hotel.maxAvailabilityPersons === 0}>
            {loading ? 'Buscando…' : 'Consultar disponibilidad'}
          </button>
        </form>

        {loading && <div className="mt-4"><Spinner /></div>}
        {result && !loading && (
          <section className="mt-4" aria-live="polite">
            <div className="card shadow-sm mb-3">
              <div className="card-body">
                <h2 className="h5 mb-1">{result.availableRoomCount} {result.availableRoomCount === 1 ? 'habitación disponible' : 'habitaciones disponibles'} con capacidad para {result.availableRoomCapacity} {result.availableRoomCapacity === 1 ? 'persona' : 'personas'}</h2>
                <p className="small text-secondary mb-0">Libres durante toda la estadía: {dateShort(result.stay.checkIn)} → {dateShort(result.stay.checkOut)}.</p>
              </div>
            </div>
            <h2 className="h6">Opciones para {result.stay.nights} {result.stay.nights === 1 ? 'noche' : 'noches'}</h2>
            {result.combination && result.combination.roomCount > 1 && (
              <article className="card shadow-sm mb-3">
                <div className="card-body">
                  <h3 className="h6">Hay disponibilidad para {result.combination.persons} personas en {result.combination.roomCount} habitaciones</h3>
                  <p className="small text-secondary">Distribución sugerida, sin camas extra. {roomCount ? 'Respetamos la cantidad de habitaciones elegida y buscamos el menor precio.' : 'Priorizamos la menor cantidad de habitaciones y luego el menor precio.'}</p>
                  {result.combination.rooms.map((room, index) => (
                    <div className="d-flex justify-content-between gap-3 border-bottom py-2" key={index}>
                      <div><strong>Habitación {index + 1}: {room.roomType}</strong><div className="small text-secondary">{room.persons} {room.persons === 1 ? 'persona' : 'personas'} · Capacidad: {room.capacity}</div></div>
                      <span className="text-nowrap">{money(room.total)}</span>
                    </div>
                  ))}
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
