import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DEMO_MODE } from '../demo/config';
import { ApiError, api } from '../api/client';
import type { PublicBookingQuote, ReceiptUploadUrl } from '../api/types';
import { ErrorBanner, Spinner } from '../components/Feedback';
import { money } from '../lib/format';
import { bookingThemeFromConfig, bookingThemeStyle } from '../lib/bookingTheme';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

const dateLong = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

const fileSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type Step = 'form' | 'uploading' | 'sending' | 'done';

function DemoNotice() {
  if (!DEMO_MODE) return null;
  return <div className="alert alert-info small">
    <strong>Vista del huésped · Demostración</strong>
    <p className="mb-2">No transfieras dinero ni cargues datos reales. El comprobante es ficticio; no se suben archivos. Continuá en esta pestaña sin recargar.</p>
    <Link to="/booking-links" className="me-3">Volver a solicitudes</Link>
    <Link to="/reservations">Ir a recepción / verificar pago</Link>
  </div>;
}

interface SubmitResult {
  code: string;
  total: number;
  deposit: number;
  hotel: { name: string; whatsapp: string | null; phone: string | null; slug: string; };
}

function hotelContact(hotel: { whatsapp: string | null; phone: string | null }): { label: string; href: string } | null {
  if (DEMO_MODE) return null;
  const digits = (hotel.whatsapp ?? hotel.phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const isWhatsapp = Boolean(hotel.whatsapp);
  return {
    label: isWhatsapp ? 'Escribir por WhatsApp' : 'Llamar al hotel',
    href: isWhatsapp ? `https://wa.me/${digits}` : `tel:${digits}`,
  };
}

export function PublicBookingPage() {
  const { token = '' } = useParams();
  const [quote, setQuote] = useState<PublicBookingQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [demoReceipt, setDemoReceipt] = useState(false);
  const [form, setForm] = useState(DEMO_MODE
    ? { firstName: 'Ana', lastName: 'Demostración', phone: '0000000000', email: 'ana@hotel-demo.example', externalRef: 'DEMO-SIN-VALOR', notes: 'Solicitud ficticia para presentar el recorrido.' }
    : { firstName: '', lastName: '', phone: '', email: '', externalRef: '', notes: '' });
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    api<{ data: PublicBookingQuote }>(`/public/booking/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setQuote(response.data);
      })
      .catch((err: ApiError) => {
        if (!controller.signal.aborted) setLoadError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [token]);

  function pickReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (!file) {
      setReceipt(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('El comprobante tiene que ser una foto (JPG, PNG, WEBP) o un PDF.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError(`El comprobante no puede superar los 5 MB (tu archivo pesa ${fileSize(file.size)}).`);
      event.target.value = '';
      return;
    }
    setReceipt(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!quote) return;
    setError(null);

    const needsReceipt = quote.totals.deposit > 0;
    if (needsReceipt && !(DEMO_MODE ? demoReceipt : receipt)) {
      setError('Adjuntá el comprobante de la transferencia para enviar la reserva.');
      return;
    }

    let uploadedPath: string | null = DEMO_MODE && demoReceipt ? 'demo-comprobante' : null;
    try {
      if (!DEMO_MODE && receipt) {
        setStep('uploading');
        const signed = await api<{ data: ReceiptUploadUrl }>(
          `/public/booking/${encodeURIComponent(token)}/receipt`,
          {
            method: 'POST',
            body: { fileName: receipt.name, mimeType: receipt.type, size: receipt.size },
            timeoutMs: 20000,
          },
        );
        const upload = await fetch(signed.data.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': receipt.type },
          body: receipt,
        });
        if (!upload.ok) {
          throw new Error('No se pudo subir el comprobante. Revisá tu conexión y volvé a intentarlo.');
        }
        uploadedPath = signed.data.path;
      }

      setStep('sending');
      const response = await api<{ data: SubmitResult }>(`/public/booking/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          externalRef: form.externalRef.trim() || null,
          notes: form.notes.trim() || null,
          receiptPath: uploadedPath,
          receiptFileName: receipt?.name ?? null,
        },
        timeoutMs: 30000,
      });
      setResult(response.data);
      setStep('done');
    } catch (err) {
      setStep('form');
      setError((err as Error).message || 'No se pudo enviar la reserva. Probá de nuevo.');
      if (fileInput.current) fileInput.current.value = '';
      setReceipt(null);
    }
  }

  if (loading) {
    return (
      <div className="login-screen">
        <Spinner />
      </div>
    );
  }

  if (loadError || !quote) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <DemoNotice />
          <div className="login-brand">
            <h1>Solicitud de reserva</h1>
          </div>
          <div className="alert alert-danger mb-0" role="alert">
            {loadError ?? 'No encontramos esta solicitud de reserva.'}
          </div>
        </div>
      </div>
    );
  }

  const contact = hotelContact(quote.hotel);
  const themeStyle = bookingThemeStyle(bookingThemeFromConfig({ bookingTheme: quote.hotel.bookingTheme }));
  const needsReceipt = quote.totals.deposit > 0;
  const busy = step === 'uploading' || step === 'sending';

  if (step === 'done' && result) {
    const doneContact = hotelContact(result.hotel);
    return (
      <div className="login-screen public-booking-theme" style={themeStyle}>
        <div className="booking-card">
          <DemoNotice />
          <div className="booking-success">
            <div className="booking-success-icon">✓</div>
            <h1 className="h5 mt-3 mb-1">¡Reserva enviada!</h1>
            <p className="text-secondary mb-0">
              La recepción de {result.hotel.name} va a verificar el comprobante y te va a confirmar la reserva.
            </p>
          </div>
          <dl className="detail-list mt-4">
            <dt>Código</dt>
            <dd>
              <strong>{result.code}</strong>
            </dd>
            <dt>Total de la estadía</dt>
            <dd>{money(result.total)}</dd>
            <dt>Anticipo informado</dt>
            <dd className="text-success">{money(result.deposit)}</dd>
          </dl>
            <p className="text-secondary small">
              Guardá el código: sirve para consultar el estado de la reserva.
            </p>
            {!DEMO_MODE && <a className="btn btn-outline-primary w-100 mb-3" href={`/consultar-reserva?codigo=${encodeURIComponent(result.code)}&slug=${encodeURIComponent(result.hotel.slug)}`}>
              Consultar mi reserva
            </a>}
          {doneContact && (
            <a className="btn btn-primary w-100" href={doneContact.href} target="_blank" rel="noopener noreferrer">
              {doneContact.label}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen booking-screen public-booking-theme" style={themeStyle}>
      <div className="booking-card">
        <DemoNotice />
        <div className="login-brand">
          <h1>{quote.hotel.name}</h1>
          <p className="text-secondary mb-0">Solicitud de reserva</p>
          {DEMO_MODE && (quote.hotel.phone || quote.hotel.whatsapp) && <p className="text-secondary small mt-2 mb-0">
            Contacto ilustrativo: {quote.hotel.whatsapp && `WhatsApp ${quote.hotel.whatsapp}`} {quote.hotel.phone && `Tel. ${quote.hotel.phone}`}
          </p>}
        </div>

        {quote.expired ? (
          <div className="alert alert-warning mb-0" role="alert">
            Esta solicitud venció. Pedile al hotel que te genere una nueva.
          </div>
        ) : (
          <>
            <div className="booking-stay">
              <div className="booking-stay-dates">
                <div>
                  <span className="booking-label">Check-in</span>
                  <strong>{dateLong(quote.stay.checkIn)}</strong>
                  <span className="text-secondary small d-block">desde las 11:00</span>
                </div>
                <div className="booking-nights">
                  {quote.stay.nights} {quote.stay.nights === 1 ? 'noche' : 'noches'}
                </div>
                <div className="text-end">
                  <span className="booking-label">Check-out</span>
                  <strong>{dateLong(quote.stay.checkOut)}</strong>
                  <span className="text-secondary small d-block">hasta las 10:00</span>
                </div>
              </div>
              <p className="text-secondary small mb-0">
                {quote.stay.rooms?.length ? `${quote.stay.rooms.length} habitación(es)` : quote.stay.roomType} · {quote.stay.persons} persona(s)
                {quote.stay.extraBeds > 0 ? ` + ${quote.stay.extraBeds} cama(s) extra(s)` : ''}
              </p>
              {quote.stay.rooms?.map((room, index) => <div className="small mt-2" key={index}>Habitación {index + 1}: {room.roomType} · {room.persons} personas{room.extraBeds > 0 ? ` + ${room.extraBeds} camas extras` : ''} · {money(room.total)}</div>)}
            </div>

            <div className="totals-box">
              <div>
                <span>
                  Habitaciones ({(quote.stay.rooms?.length ?? 0) > 1 ? `${quote.stay.rooms!.length} habitaciones × ${quote.stay.nights} noches` : quote.stay.roomPricingMode === 'PER_PERSON'
                    ? `${quote.stay.persons} personas × ${quote.stay.nights} noches`
                    : `${quote.stay.nights} noches`})
                </span>
                <strong>{money(quote.totals.roomTotal)}</strong>
              </div>
              {quote.services.length > 0 && (
                <>
                  {quote.services.map((line, index) => (
                    <div key={`${line.name}-${index}`}>
                      <span>
                        {line.name} <span className="text-secondary small">× {line.quantity}</span>
                        {line.description && <span className="d-block small text-secondary text-break" style={{ whiteSpace: 'pre-line' }}>{line.description}</span>}
                        {line.chargeType === 'PER_ROOM_INTERVAL' && <span className="d-block small text-secondary">Cada {line.intervalDays} día(s), por habitación, sin incluir el día de salida.</span>}
                      </span>
                      <strong>{money(line.lineTotal)}</strong>
                    </div>
                  ))}
                </>
              )}
              <div>
                <span>Total de la estadía</span>
                <strong>{money(quote.totals.total)}</strong>
              </div>
              {needsReceipt ? (
                <>
                  <div>
                    <span>Anticipo a transferir</span>
                    <strong className="text-success">{money(quote.totals.deposit)}</strong>
                  </div>
                  <div>
                    <span>Saldo a pagar en el hotel</span>
                    <strong>{money(quote.totals.balance)}</strong>
                  </div>
                </>
              ) : (
                <div>
                  <span>Sin anticipo</span>
                  <strong className="text-success">{money(quote.totals.total)} a pagar en el hotel</strong>
                </div>
              )}
            </div>

            {needsReceipt && (
              <div className="alert alert-info small">
                <strong>¿Cómo confirmás la reserva?</strong>
                <ol className="mb-0 mt-1 ps-3">
                  <li>{DEMO_MODE ? `Anticipo simulado de ${money(quote.totals.deposit)}: no realizar transferencias.` : `Transferí el anticipo de ${money(quote.totals.deposit)}.`}</li>
                  <li>{DEMO_MODE ? 'Usá abajo el comprobante ficticio.' : 'Adjuntá abajo el comprobante (foto o PDF).'}</li>
                  <li>Completá tus datos y enviá el formulario.</li>
                </ol>
                {contact && (
                  <a className="d-inline-block mt-2" href={contact.href} target="_blank" rel="noopener noreferrer">
                    ¿Dudas? {contact.label}
                  </a>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <h2 className="section-title">Tus datos</h2>
              <div className="row g-3">
                <div className="col-sm-6">
                  <label className="form-label" htmlFor="booking-first-name">
                    Nombre *
                  </label>
                  <input
                    id="booking-first-name"
                    className="form-control"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div className="col-sm-6">
                  <label className="form-label" htmlFor="booking-last-name">
                    Apellido *
                  </label>
                  <input
                    id="booking-last-name"
                    className="form-control"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    autoComplete="family-name"
                    required
                  />
                </div>
                <div className="col-sm-6">
                  <label className="form-label" htmlFor="booking-phone">
                    Teléfono *
                  </label>
                  <input
                    id="booking-phone"
                    className="form-control"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    autoComplete="tel"
                    required
                  />
                </div>
                <div className="col-sm-6">
                  <label className="form-label" htmlFor="booking-email">
                    Email *
                  </label>
                  <input
                    id="booking-email"
                    className="form-control"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {needsReceipt && (
                <div className="mt-3">
                  <label className="form-label" htmlFor="booking-receipt">
                    Comprobante de la transferencia *
                  </label>
                  {DEMO_MODE ? (
                    <div>
                      <button id="booking-receipt" type="button" aria-pressed={demoReceipt} className={`btn ${demoReceipt ? 'btn-success' : 'btn-outline-primary'}`} onClick={() => setDemoReceipt((value) => !value)}>
                        {demoReceipt ? '✓ Comprobante ficticio adjuntado · Quitar' : 'Usar comprobante ficticio'}
                      </button>
                      <div className="form-text">Sin archivo real ni transferencia. La recepción verá una imagen de demostración.</div>
                    </div>
                  ) : (
                    <>
                      <input
                        id="booking-receipt"
                        ref={fileInput}
                        className="form-control"
                        type="file"
                        accept={ACCEPT}
                        onChange={pickReceipt}
                        required={needsReceipt}
                      />
                      <div className="form-text">
                        Foto o PDF, hasta 5 MB. Podés adjuntar la captura de la transferencia o el comprobante del banco.
                      </div>
                    </>
                  )}
                  <div className="mt-2">
                    <label className="form-label" htmlFor="booking-ref">
                      Número de operación (opcional)
                    </label>
                    <input
                      id="booking-ref"
                      className="form-control"
                      value={form.externalRef}
                      onChange={(e) => setForm({ ...form, externalRef: e.target.value })}
                      placeholder="Como figura en el comprobante"
                    />
                  </div>
                </div>
              )}

              <div className="mt-3">
                <label className="form-label" htmlFor="booking-notes">
                  Comentarios (opcional)
                </label>
                <textarea
                  id="booking-notes"
                  className="form-control"
                  rows={2}
                  maxLength={500}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Horario de llegada, cuna, alguna necesidad especial…"
                />
              </div>

              {error && (
                <div className="mt-3">
                  <ErrorBanner message={error} onDismiss={() => setError(null)} />
                </div>
              )}

              <button type="submit" className="btn btn-primary w-100 mt-4" disabled={busy}>
                {step === 'uploading' ? 'Subiendo comprobante…' : step === 'sending' ? 'Enviando…' : 'Enviar reserva'}
              </button>
              <p className="text-secondary small text-center mt-2 mb-0">
                Al enviar, la recepción verifica el anticipo y confirma la reserva.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
