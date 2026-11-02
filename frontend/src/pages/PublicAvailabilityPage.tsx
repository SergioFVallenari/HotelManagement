import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, api, buildQuery } from '../api/client';
import type { PublicAvailability, PublicBookingPageConfig, PublicCalendarRoom } from '../api/types';
import { ErrorBanner, Spinner } from '../components/Feedback';
import { dateShort, money } from '../lib/format';
import { bookingThemeFromConfig, bookingThemeStyle } from '../lib/bookingTheme';
import { buildAvailabilityMessage } from '../lib/availabilityShare';
import { serviceQuantityLabel, serviceRateLabel } from '../lib/services';
import { PublicAvailabilityCalendar } from '../components/PublicAvailabilityCalendar';

const BOOKING_SLUG = import.meta.env.VITE_PUBLIC_BOOKING_SLUG;

export function PublicAvailabilityPage() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const bookingSlug = routeSlug ?? BOOKING_SLUG;
  const [pageConfig, setPageConfig] = useState<PublicBookingPageConfig | null>(null);
  const [loadedConfigSlug, setLoadedConfigSlug] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [persons, setPersons] = useState(2);
  const [roomTypeId, setRoomTypeId] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<PublicCalendarRoom | null>(null);
  const [includeExtraBeds, setIncludeExtraBeds] = useState(false);
  const [selectedServices, setSelectedServices] = useState<{ serviceId: number; quantity?: number }[]>([]);
  const [result, setResult] = useState<PublicAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'calendar' | 'details'>('calendar');
  const detailsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step === 'details') detailsHeading.current?.focus();
  }, [step]);

  useEffect(() => {
    const controller = new AbortController();
    api<{ data: PublicBookingPageConfig }>(`/public/availability/${encodeURIComponent(bookingSlug)}/config`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setPageConfig(response.data);
          setPersons((current) => Math.max(1, Math.min(current, response.data.hotel.maxAvailabilityPersons)));
          setRoomTypeId('');
          setCheckIn('');
          setCheckOut('');
          setStep('calendar');
          setSelectedRoom(null);
          setIncludeExtraBeds(false);
          setSelectedServices([]);
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

  const roomTypes = pageConfig?.hotel.roomTypes ?? [];
  const extraBedsEnabled = !!pageConfig?.hotel.publicExtraBedsEnabled && !!selectedRoom?.maxExtraBeds;
  const hotelLimit = includeExtraBeds && extraBedsEnabled ? pageConfig?.hotel.maxAvailabilityPersonsWithExtraBeds ?? 0 : pageConfig?.hotel.maxAvailabilityPersons ?? 0;
  const maxPersons = selectedRoom ? Math.min(hotelLimit, selectedRoom.capacity + (includeExtraBeds && extraBedsEnabled ? selectedRoom.maxExtraBeds : 0)) : 0;

  function changeRoomType(value: string) {
    if (!pageConfig) return;
    setRoomTypeId(value);
    setCheckIn('');
    setCheckOut('');
    setSelectedRoom(null);
    setResult(null);
    setError(null);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!pageConfig || step !== 'details' || !selectedRoom || !checkIn || !checkOut || !roomTypeId || persons > maxPersons) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const query = buildQuery({ checkIn, checkOut, persons, roomTypeId, roomId: selectedRoom.id, includeExtraBeds: includeExtraBeds ? 'true' : undefined, services: selectedServices.length ? JSON.stringify(selectedServices) : undefined });
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

  const quote = result;
  const contact = quote?.hotel.whatsapp || quote?.hotel.phone;
  const contactDigits = contact?.replace(/\D/g, '');
  const whatsappMessage = quote ? buildAvailabilityMessage(quote) : '';
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
          <p className="text-secondary mb-0">Elegí tus fechas y después completá tu estadía</p>
        </div>

        <ol className="list-unstyled d-flex flex-wrap gap-3 small mb-4" aria-label="Pasos de la consulta">
          <li className={step === 'calendar' ? 'fw-semibold text-primary' : 'text-secondary'} aria-current={step === 'calendar' ? 'step' : undefined}>1. Habitación y fechas</li>
          <li className={step === 'details' ? 'fw-semibold text-primary' : 'text-secondary'} aria-current={step === 'details' ? 'step' : undefined}>2. Personas y servicios</li>
        </ol>
        <div hidden={step !== 'calendar'}>
          <h2 className="h5">Elegí tu habitación y las fechas</h2>
          <PublicAvailabilityCalendar key={`${bookingSlug}:${roomTypeId}`} slug={bookingSlug} roomTypeId={roomTypeId} roomTypes={roomTypes} onTypeChange={changeRoomType} onSelect={(entry, exit, room) => {
            setCheckIn(entry);
            setCheckOut(exit);
            setSelectedRoom(room);
            const limit = Math.min(includeExtraBeds && pageConfig.hotel.publicExtraBedsEnabled ? pageConfig.hotel.maxAvailabilityPersonsWithExtraBeds : pageConfig.hotel.maxAvailabilityPersons, room.capacity + (includeExtraBeds && pageConfig.hotel.publicExtraBedsEnabled ? room.maxExtraBeds : 0));
            setPersons((current) => Math.max(1, Math.min(current, limit)));
            setResult(null);
            setError(null);
            setStep('details');
          }} />
        </div>
        <div hidden={step !== 'details'}>
        <h2 className="h5" ref={detailsHeading} tabIndex={-1}>Personas y servicios extra</h2>
        <div className="card shadow-sm mb-4"><div className="card-body">
          <p className="fw-semibold mb-1">Habitación {selectedRoom?.number}{selectedRoom?.name ? ` · ${selectedRoom.name}` : ''}</p>
          <p className="small mb-1">{selectedRoom?.typeName} · Capacidad base: {selectedRoom?.capacity} personas{extraBedsEnabled ? ` · Hasta ${selectedRoom.maxExtraBeds} cama(s) extra` : ''}</p>
          <p className="small mb-2">Entrada: <strong>{dateShort(checkIn)}</strong> · Salida: <strong>{dateShort(checkOut)}</strong></p>
          <button type="button" className="btn btn-outline-primary btn-sm" disabled={loading} onClick={() => { setStep('calendar'); setResult(null); setError(null); }}>Modificar habitación o fechas</button>
        </div></div>
        <p className="small text-secondary">Indicá cuántas personas se alojan y, si querés, agregá servicios extra para calcular el total.</p>
        <form onSubmit={search}>
          <fieldset disabled={loading}>
            <div className="row g-3">
               <div className="col-12">
                <label className="form-label" htmlFor="availability-persons">Personas</label>
                <select id="availability-persons" className="form-select" value={persons}
                  disabled={maxPersons === 0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setPersons(value);
                    setResult(null);
                  }}>
                  {Array.from({ length: maxPersons }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>{count} {count === 1 ? 'persona' : 'personas'}</option>
                  ))}
                </select>
                <div className="form-text">Cantidad de huéspedes para la habitación seleccionada.</div>
              </div>
            </div>
            {extraBedsEnabled && (
              <div className="form-check mt-3">
                <input id="availability-extra-beds" className="form-check-input" type="checkbox" checked={includeExtraBeds} onChange={(event) => {
                  const checked = event.target.checked;
                  setIncludeExtraBeds(checked);
                  const limit = Math.min(checked ? pageConfig.hotel.maxAvailabilityPersonsWithExtraBeds : pageConfig.hotel.maxAvailabilityPersons, selectedRoom.capacity + (checked ? selectedRoom.maxExtraBeds : 0));
                  const total = Math.max(1, Math.min(persons, limit));
                  setPersons(total);
                  setResult(null);
                }} />
                <label htmlFor="availability-extra-beds" className="form-check-label">Acepto agregar camas extra</label>
                <div className="form-text">Solo se agregarán si hacen falta para la distribución propuesta. El precio se incluye en el total.</div>
              </div>
            )}
            {!!pageConfig.hotel.publicServices?.length && (
              <fieldset className="mt-4">
                <legend className="h6">Servicios opcionales</legend>
                <p className="small text-secondary">Agregalos a tu consulta. El precio se incluirá en el total de tu estadía.</p>
                {pageConfig.hotel.publicServices.map((service) => {
                  const selected = selectedServices.find((line) => line.serviceId === service.id);
                  return <div className="mb-3" key={service.id}>
                    <div className="form-check">
                      <input id={`availability-service-${service.id}`} className="form-check-input" type="checkbox" checked={!!selected} onChange={(event) => {
                        setSelectedServices((current) => event.target.checked ? [...current, { serviceId: service.id, ...(service.chargeType === 'PACK' ? { quantity: 1 } : {}) }] : current.filter((line) => line.serviceId !== service.id));
                        setResult(null);
                      }} />
                      <label htmlFor={`availability-service-${service.id}`} className="form-check-label">{service.name} · {serviceRateLabel(service)}</label>
                    </div>
                    {service.description && <div className="small text-secondary text-break mt-1" style={{ whiteSpace: 'pre-line' }}>{service.description}</div>}
                    {service.chargeType === 'PER_ROOM_INTERVAL' && <div className="form-text">Se calcula para esta habitación, sin incluir el día de salida.</div>}
                    {selected && service.chargeType === 'PACK' && <div className="mt-2">
                      <label htmlFor={`availability-service-quantity-${service.id}`} className="form-label small">Cantidad de packs de {service.name}</label>
                      <input id={`availability-service-quantity-${service.id}`} className="form-control" type="number" min={1} max={1000} step={1} required value={selected.quantity || ''} onChange={(event) => {
                        setSelectedServices((current) => current.map((line) => line.serviceId === service.id ? { ...line, quantity: Number(event.target.value) } : line));
                        setResult(null);
                      }} />
                    </div>}
                  </div>;
                })}
              </fieldset>
            )}
            {error && <div className="mt-3"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
            <button type="submit" className="btn btn-primary w-100 mt-4" disabled={loading || maxPersons === 0}>
              {loading ? 'Cotizando…' : 'Ver cotización de esta habitación'}
            </button>
          </fieldset>
        </form>

        {loading && <div className="mt-4"><Spinner /></div>}
        {result && quote && !loading && (
          <section className="mt-4" aria-live="polite">
            <div className="card shadow-sm mb-3">
              <div className="card-body">
                <h2 className="h5 mb-1">Tu consulta · Habitación {quote.stay.room?.number}{quote.stay.room?.name ? ` · ${quote.stay.room.name}` : ''}</h2>
                <p className="small text-secondary mb-0">{dateShort(result.stay.checkIn)} → {dateShort(result.stay.checkOut)} · {result.stay.nights} {result.stay.nights === 1 ? 'noche' : 'noches'} · {result.stay.persons} {result.stay.persons === 1 ? 'persona' : 'personas'}.</p>
                {quote.stay.roomType && <p className="small text-secondary mb-0">Tipo elegido: <strong>{quote.stay.roomType}</strong>.</p>}
              </div>
            </div>
            {!!quote.combination && !!quote.services?.length && (
              <div className="card shadow-sm mb-3"><div className="card-body">
                <h3 className="h6">Servicios elegidos</h3>
                {quote.services.map((service) => <div className="d-flex justify-content-between gap-3 py-2 border-bottom" key={service.serviceId}>
                  <div>{service.name}{service.description && <div className="small text-secondary text-break" style={{ whiteSpace: 'pre-line' }}>{service.description}</div>}<div className="small text-secondary">{serviceQuantityLabel(service, quote.stay, quote.combination?.roomCount ?? 0)} · {money(service.unitPrice)} por unidad</div></div>
                  <span className="text-nowrap">{money(service.lineTotal)}</span>
                </div>)}
                <div className="d-flex justify-content-between gap-3 mt-3 fw-semibold"><span>Total de servicios</span><span>{money(quote.servicesTotal)}</span></div>
              </div></div>
            )}
            {quote.combination && (
              <article className="card shadow-sm mb-3">
                <div className="card-body">
                  <h3 className="h6">Cotización de la habitación seleccionada</h3>
                  <p className="small text-secondary">Esta es la habitación y cotización que enviaremos en tu consulta por WhatsApp.</p>
                  {quote.combination.rooms.map((room, index) => (
                    <div className="d-flex justify-content-between gap-3 border-bottom py-2" key={index}>
                      <div><strong>{room.roomType}</strong><div className="small text-secondary">{room.persons} {room.persons === 1 ? 'persona' : 'personas'} · Capacidad base: {room.capacity}{room.extraBeds ? ` + ${room.extraBeds} cama(s) extra` : ''}</div><div className="small text-secondary">Amenities: {room?.amenities?.join(', ') || 'Ninguno'}</div></div>
                      <span className="text-nowrap">{money(room.total)}</span>
                    </div>
                  ))}
                  {!!quote.combination.extraBeds && <>
                    <div className="d-flex justify-content-between gap-3 mt-3"><span>Habitación por estadía</span><span>{money(quote.combination.roomTotal)}</span></div>
                    <div className="d-flex justify-content-between gap-3"><span>{quote.combination.extraBeds} cama(s) extra · {quote.combination.extraBedService?.name}</span><span>{money(quote.combination.extraBedsTotal)}</span></div>
                  </>}
                  {!!quote.servicesTotal && <div className="d-flex justify-content-between gap-3 mt-2"><span>Servicios elegidos</span><span>{money(quote.servicesTotal)}</span></div>}
                  <div className="d-flex justify-content-between gap-3 mt-3 fw-semibold"><span>Total por estadía</span><span>{money(quote.combination.total)}</span></div>
                </div>
              </article>
            )}
            {!result.combination && <p className="text-secondary">{result.availableRoomCount === 0 ? 'La habitación seleccionada ya no está disponible para esas fechas. Volvé al calendario para elegir otra habitación o cambiar las fechas.' : 'La habitación seleccionada no admite esa cantidad de personas. Revisá la cantidad de huéspedes o elegí otra habitación.'}</p>}
            {contactDigits && !!quote.combination && (
              <a className="btn btn-success w-100 mt-2" href={result.hotel.whatsapp ? `https://wa.me/${contactDigits}?text=${encodeURIComponent(whatsappMessage)}` : `tel:${contactDigits}`}
                target={result.hotel.whatsapp ? '_blank' : undefined} rel="noreferrer">
                {result.hotel.whatsapp ? 'Consultar esta habitación por WhatsApp' : 'Llamar al hotel'}
              </a>
            )}
            <p className="small text-secondary mt-3 mb-0">La disponibilidad y los precios se confirman al gestionar la solicitud con el hotel.</p>
          </section>
        )}
        </div>
      </main>
    </div>
  );
}
