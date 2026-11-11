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
  const [step, setStep] = useState<'calendar' | 'details' | 'quote'>('calendar');
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const quoteHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step === 'details') detailsHeading.current?.focus();
    if (step === 'quote') quoteHeading.current?.focus();
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
      setStep('quote');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo consultar la disponibilidad. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const quote = result;
  const contact = quote?.hotel.whatsapp || quote?.hotel.phone;
  const contactDigits = contact?.replace(/\D/g, '');
  const whatsappMessage = quote ? buildAvailabilityMessage(quote, roomTypes.length) : '';
  const theme = bookingThemeFromConfig({ bookingTheme: pageConfig?.hotel.bookingTheme ?? result?.hotel.bookingTheme });
  const themeStyle = bookingThemeStyle(theme);

  if (loadedConfigSlug !== bookingSlug) {
    return <div className="login-screen"><Spinner /></div>;
  }

  if (!pageConfig) {
    return <div className="login-screen"><div className="login-card"><ErrorBanner message={error ?? 'No se pudo cargar la página del alojamiento.'} /></div></div>;
  }

  return (
    <div className="availability-screen public-booking-theme" style={themeStyle}>
      <header className="availability-header">
        <span className="availability-brand-icon" aria-hidden="true">{pageConfig.hotel.name.trim().charAt(0).toUpperCase()}</span>
        <div><strong>{pageConfig.hotel.name}</strong>{pageConfig.hotel.slogan && <span>{pageConfig.hotel.slogan}</span>}</div>
        {(pageConfig.hotel.whatsapp || pageConfig.hotel.phone) && <a className="availability-help" href={pageConfig.hotel.whatsapp ? `https://wa.me/${pageConfig.hotel.whatsapp.replace(/\D/g, '')}` : `tel:${pageConfig.hotel.phone?.replace(/\D/g, '')}`} target={pageConfig.hotel.whatsapp ? '_blank' : undefined} rel="noreferrer">Ayuda</a>}
      </header>
      <main className="booking-card availability-card">
        <div className="availability-heading">
          <span className="availability-eyebrow">Reservá tu estadía</span>
          <h1>{step === 'calendar' ? 'Encontrá tu próxima escapada' : step === 'details' ? 'Personalizá tu estadía' : 'Revisá tu cotización'}</h1>
          <p>{step === 'calendar' ? 'Elegí tu habitación y las fechas para consultar disponibilidad.' : step === 'details' ? 'Indicá cuántas personas viajan y agregá servicios si lo necesitás.' : 'Este es el resumen estimado de tu estadía antes de consultar.'}</p>
        </div>

        <ol className="availability-steps" aria-label="Pasos de la consulta">
          {(['calendar', 'details', 'quote'] as const).map((item, index) => <li key={item} className={step === item ? 'is-active' : ''} aria-current={step === item ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span>{['Habitación y fechas', 'Personas y servicios', 'Cotización'][index]}</li>)}
        </ol>
        <div hidden={step !== 'calendar'}>
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
        <h2 className="visually-hidden" ref={detailsHeading} tabIndex={-1}>Personas y servicios extra</h2>
        <div className="card shadow-sm mb-4 availability-stay-card"><div className="card-body">
          <p className="fw-semibold mb-1">Habitación {selectedRoom?.number}{selectedRoom?.name ? ` · ${selectedRoom.name}` : ''}</p>
          <p className="small mb-1">{selectedRoom?.typeName} · Capacidad base: {selectedRoom?.capacity} personas{extraBedsEnabled ? ` · Hasta ${selectedRoom.maxExtraBeds} cama(s) extra` : ''}</p>
          <p className="small mb-2">Entrada: <strong>{dateShort(checkIn)}</strong> · Salida: <strong>{dateShort(checkOut)}</strong></p>
          <button type="button" className="btn btn-outline-primary btn-sm" disabled={loading} onClick={() => { setStep('calendar'); setResult(null); setError(null); }}>Modificar habitación o fechas</button>
        </div></div>
        <p className="small text-secondary availability-details-intro">Indicá cuántas personas se alojan y, si querés, agregá servicios extra para calcular el total.</p>
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
              <div className="form-check mt-3 availability-extra-beds">
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
                  return <div className="mb-3 availability-service" key={service.id}>
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
            <div className="availability-details-selection" aria-live="polite">
              <span>Tu selección</span>
              <strong>{persons} {persons === 1 ? 'persona' : 'personas'}{selectedServices.length ? ` · ${selectedServices.length} ${selectedServices.length === 1 ? 'servicio seleccionado' : 'servicios seleccionados'}` : ''}{includeExtraBeds ? ' · camas extra si hacen falta' : ''}</strong>
            </div>
            {error && <div className="mt-3"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
            <button type="submit" className="btn btn-primary w-100 mt-4" disabled={loading || maxPersons === 0}>
              {loading ? 'Cotizando…' : 'Ver cotización de esta habitación'}
            </button>
          </fieldset>
        </form>

        {loading && <div className="mt-4"><Spinner /></div>}
        </div>
        {step === 'quote' && result && quote && !loading && (
          <section aria-live="polite">
            <h2 className="visually-hidden" ref={quoteHeading} tabIndex={-1}>Cotización</h2>
            {quote.combination && <div className="availability-quote-grid">
              <article className="card"><div className="card-body">
                <h3 className="h6 fw-bold">Detalle de tu estadía</h3>
                <dl className="availability-quote-details">
                  <div><dt>Alojamiento</dt><dd>{quote.stay.room?.name || `Habitación ${quote.stay.room?.number ?? ''}`}{quote.stay.roomType ? ` · ${quote.stay.roomType}` : ''}</dd></div>
                  <div><dt>Fechas</dt><dd>{dateShort(quote.stay.checkIn)} → {dateShort(quote.stay.checkOut)}</dd></div>
                  <div><dt>Duración</dt><dd>{quote.stay.nights} {quote.stay.nights === 1 ? 'noche' : 'noches'}</dd></div>
                  <div><dt>Huéspedes</dt><dd>{quote.stay.persons} {quote.stay.persons === 1 ? 'persona' : 'personas'}</dd></div>
                  {quote.combination.rooms.map((room, index) => !!room.amenities?.length && <div key={index}><dt>Comodidades de la habitación · {room.roomType}</dt><dd>{room.amenities.join(', ')}</dd></div>)}
                  <div><dt>Alojamiento</dt><dd>{money(quote.combination.roomTotal)}</dd></div>
                  {!!quote.combination.extraBeds && <div><dt>{quote.combination.extraBeds} cama(s) extra · {quote.combination.extraBedService?.name}</dt><dd>{money(quote.combination.extraBedsTotal)}</dd></div>}
                  {quote.services.map((service) => <div key={service.serviceId}><dt>{service.name}<small className="d-block">{serviceQuantityLabel(service, quote.stay, quote.combination?.roomCount ?? 0)} · {money(service.unitPrice)} por unidad{service.description ? ` · ${service.description}` : ''}</small></dt><dd>{money(service.lineTotal)}</dd></div>)}
                </dl>
              </div></article>
              <aside className="card"><div className="card-body"><h3 className="h6 fw-bold">Resumen de precios</h3><p className="text-secondary small mt-4 mb-1">Total estimado</p><strong className="availability-quote-total">{money(quote.combination.total)}</strong><p className="small text-secondary mt-2">La disponibilidad y los precios se confirman al gestionar la solicitud con el hotel.</p>
                {contactDigits ? <a className="btn btn-primary w-100 mt-3" href={result.hotel.whatsapp ? `https://wa.me/${contactDigits}?text=${encodeURIComponent(whatsappMessage)}` : `tel:${contactDigits}`} target={result.hotel.whatsapp ? '_blank' : undefined} rel="noreferrer">{result.hotel.whatsapp ? 'Consultar por WhatsApp' : 'Llamar al hotel'}</a> : <p className="small text-secondary mt-3 mb-0">El alojamiento todavía no configuró un teléfono de contacto para recibir consultas.</p>}
              </div></aside>
            </div>}
            {!result.combination && <p className="text-secondary">{result.availableRoomCount === 0 ? 'La habitación seleccionada ya no está disponible para esas fechas. Volvé al calendario para elegir otra habitación o cambiar las fechas.' : 'La habitación seleccionada no admite esa cantidad de personas. Revisá la cantidad de huéspedes o elegí otra habitación.'}</p>}
            <button type="button" className="btn btn-link px-0 mt-3" onClick={() => setStep('details')}>← Volver a personas y servicios</button>
          </section>
        )}
      </main>
    </div>
  );
}
