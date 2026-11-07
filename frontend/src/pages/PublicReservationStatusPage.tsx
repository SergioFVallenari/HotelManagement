import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { PublicBookingPageConfig } from '../api/types';
import { ErrorBanner, Spinner } from '../components/Feedback';
import { money, dateShort } from '../lib/format';
import { bookingThemeFromConfig, bookingThemeStyle, type BookingTheme } from '../lib/bookingTheme';

interface ReservationStatus {
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  persons: number;
  roomType: string;
  rooms?: { roomType: string; persons: number; extraBeds: number; total: number }[];
  nights: number;
  total: number;
  amountPaid: number;
  balance: number;
  createdAt: string;
  hotel: { name: string; bookingTheme: Partial<BookingTheme> | null };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente de verificación', RESERVED: 'Confirmada', CHECKED_IN: 'En estadía',
  CHECKED_OUT: 'Finalizada', CANCELLED: 'Cancelada',
};


export function PublicReservationStatusPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('codigo') ?? '');
  const slug = params.get('slug') ?? '';
  const [reservation, setReservation] = useState<ReservationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<{ slug: string; data: PublicBookingPageConfig | null; error: string | null } | null>(null);
  const configLoading = config?.slug !== slug;
  const pageConfig = configLoading ? null : config.data;
  const configError = configLoading ? null : config.error;
  const themeStyle = bookingThemeStyle(bookingThemeFromConfig({ bookingTheme: reservation?.hotel.bookingTheme ?? pageConfig?.hotel.bookingTheme }));

  useEffect(() => {
    const controller = new AbortController();
    api<{ data: PublicBookingPageConfig }>(`/public/availability/${encodeURIComponent(slug)}/config`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setConfig({ slug, data: response.data, error: null });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setConfig({ slug, data: null, error: err instanceof ApiError ? err.message : 'No se pudo cargar la página del alojamiento.' });
      });
    return () => controller.abort();
  }, [slug]);

  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api<{ data: ReservationStatus }>(`/public/booking/status/${encodeURIComponent(code.trim())}`);
      setReservation(result.data);
    } catch {
      setError('No encontramos una reserva con ese código. Revisalo e intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  if (configLoading) {
    return <div className="login-screen"><Spinner /></div>;
  }

  if (!pageConfig) {
    return <div className="login-screen"><div className="login-card"><ErrorBanner message={configError ?? 'No se pudo cargar la página del alojamiento.'} /></div></div>;
  }

  return (
    <main className="login-screen booking-screen public-booking-theme" style={themeStyle}>
      <section className="booking-card">
        <div className="login-brand">
          <h1>{reservation?.hotel.name ?? pageConfig.hotel.name}</h1>
          <p className="text-secondary mb-0">Ingresá el código que recibiste al enviar tu solicitud.</p>
        </div>
        <form className="mt-4" onSubmit={(event) => void search(event)}>
          <label className="form-label" htmlFor="reservation-code">Código de reserva</label>
          <input id="reservation-code" className="form-control" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="RSV-…" required maxLength={30} />
          <button className="btn btn-primary w-100 mt-3" type="submit" disabled={loading}>{loading ? 'Consultando…' : 'Consultar estado'}</button>
        </form>
        {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
        {reservation && <div className="reservation-status-result mt-4">
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div><div className="small text-secondary">Reserva</div><strong>{reservation.code}</strong></div>
            <span className="badge text-bg-primary">{STATUS_LABELS[reservation.status] ?? reservation.status}</span>
          </div>
          <dl className="detail-list mt-3 mb-0">
            <dt>Habitaciones</dt><dd>{reservation.rooms?.length ? reservation.rooms.map((room, index) => <div key={index}>{room.roomType} · {room.persons} personas{room.extraBeds > 0 ? ` + ${room.extraBeds} camas extras` : ''}</div>) : reservation.roomType}</dd>
            <dt>Fechas</dt><dd>{dateShort(reservation.checkIn)} – {dateShort(reservation.checkOut)} ({reservation.nights} noches)</dd>
            <dt>Personas</dt><dd>{reservation.persons}</dd>
            <dt>Total</dt><dd>{money(reservation.total)}</dd>
            <dt>Pagado</dt><dd>{money(reservation.amountPaid)}</dd>
            <dt>Saldo pendiente</dt><dd>{money(reservation.balance)}</dd>
          </dl>
        </div>}
        <a className="d-block text-center mt-3" href="/">Volver al inicio</a>
      </section>
    </main>
  );
}
