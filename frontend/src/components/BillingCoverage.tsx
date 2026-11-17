import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { dateTimeShort, money } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';

type Coverage = {
  status: 'TRIALING' | 'EXPIRED' | 'GRANDFATHERED' | 'ACTIVE';
  daysRemaining: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  maximumHotels: number | null;
  maximumRoomsPerHotel: number | null;
  maximumUsersPerHotel: number | null;
  testCheckout?: { available: boolean; monthlyPrice: string | null; currency: string | null };
  hotels: Array<{ id: number; name: string; covered: boolean; activeRooms: number; activeUsers: number }>;
};

export function BillingCoverage() {
  const { data, error, loading, reload } = useApi<{ data: Coverage }>('/billing/coverage');
  const [selection, setSelection] = useState<number[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [checkoutConfirm, setCheckoutConfirm] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [payerEmail, setPayerEmail] = useState('');
  const coverage = data?.data;
  const selected = selection ?? coverage?.hotels.filter((hotel) => hotel.covered).map((hotel) => hotel.id) ?? [];

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await api('/billing/coverage', { method: 'PUT', body: { companyIds: selected } });
      setConfirm(false);
      setSelection(null);
      setSaved(true);
      reload();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function startCheckout() {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const result = await api<{ data: { checkoutUrl: string } }>('/billing/checkout', { method: 'POST', body: { payerEmail: payerEmail.trim() } });
      const url = new URL(result.data.checkoutUrl);
      if (url.protocol !== 'https:' || url.username || url.password || (url.hostname !== 'mercadopago.com.ar' && !url.hostname.endsWith('.mercadopago.com.ar'))) throw new Error('La dirección de pago no es válida.');
      window.location.assign(url.toString());
    } catch (err) {
      setCheckoutError((err as Error).message);
      setCheckoutBusy(false);
    }
  }

  if (loading) return <p>Cargando suscripción…</p>;
  if (error || !coverage) return <div className="alert alert-danger">{error ?? 'No se pudo cargar la suscripción.'} <button type="button" className="btn btn-sm btn-outline-danger" onClick={reload}>Reintentar</button></div>;

  return <div className="card shadow-sm"><div className="card-body">
    <h2 className="h5">Suscripción y hoteles</h2>
    {coverage.status === 'GRANDFATHERED' ? <p>Tu cuenta conserva el acceso anterior sin fecha de vencimiento.</p> : <>
      <p>{coverage.status === 'EXPIRED' ? 'Tu prueba venció.' : coverage.status === 'ACTIVE' ? `Suscripción activa${coverage.currentPeriodEnd ? ` hasta ${dateTimeShort(coverage.currentPeriodEnd)}` : ''}.` : `Prueba gratuita: ${coverage.daysRemaining} días restantes.`} {coverage.status !== 'ACTIVE' && coverage.trialEndsAt && <>Vencimiento: {dateTimeShort(coverage.trialEndsAt)}.</>}</p>
      <p>Podés seleccionar hasta {coverage.maximumHotels} hoteles. Los demás conservan sus datos.</p>
    </>}
    <section className="border rounded p-3 mb-3" aria-labelledby="billing-plan-title">
      <h3 id="billing-plan-title" className="h6">Plan LAIXIA</h3>
      <p className="mb-2">Incluye un hotel, hasta 5 habitaciones y 3 usuarios activos.</p>
      {coverage.testCheckout?.available
        ? <p className="mb-2">Importe de prueba: {money(Number(coverage.testCheckout.monthlyPrice))} por mes. No es el precio definitivo.</p>
        : <p className="text-secondary mb-2">Precio y contratación todavía no disponibles.</p>}
      {coverage.testCheckout?.available && <p className="text-warning-emphasis mb-2">Checkout experimental: usar exclusivamente cuentas y medios de pago de prueba. El acceso pago no está habilitado para clientes.</p>}
      {coverage.status === 'TRIALING' && <p className="text-secondary mb-2">La contratación de prueba estará disponible cuando finalice el período gratuito.</p>}
      {coverage.testCheckout?.available && coverage.status === 'EXPIRED' && <div className="mb-3"><label htmlFor="billing-payer-email" className="form-label">Email de la cuenta de Mercado Pago del pagador</label><input id="billing-payer-email" type="email" className="form-control" value={payerEmail} maxLength={254} onChange={(event) => setPayerEmail(event.target.value)} /><div className="form-text">Debe coincidir con el email usado en Mercado Pago. Para esta prueba usá solo datos de la cuenta compradora de prueba.</div></div>}
      <button type="button" className="btn btn-primary" disabled={!coverage.testCheckout?.available || coverage.status !== 'EXPIRED' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())} onClick={() => { setCheckoutError(null); setCheckoutConfirm(true); }}>Continuar con Mercado Pago</button>
    </section>
    {saved && <div className="alert alert-success">Cobertura actualizada.</div>}
    <fieldset disabled={coverage.maximumHotels === null || saving}>
      <legend className="h6">Hoteles cubiertos</legend>
      {coverage.maximumHotels !== null && selected.length > coverage.maximumHotels && <div className="alert alert-warning">Elegí hasta {coverage.maximumHotels} hotel para continuar con el plan pago.</div>}
      {coverage.hotels.map((hotel) => <div className="form-check mb-2" key={hotel.id}>
        <input className="form-check-input" type="checkbox" id={`billing-hotel-${hotel.id}`} checked={selected.includes(hotel.id)}
          disabled={!selected.includes(hotel.id) && selected.length >= (coverage.maximumHotels ?? 0)}
          onChange={(event) => { setSaved(false); setSelection(event.target.checked ? [...selected, hotel.id] : selected.filter((id) => id !== hotel.id)); }} />
        <label className="form-check-label" htmlFor={`billing-hotel-${hotel.id}`}>
          {hotel.name} <span className="text-secondary">— habitaciones activas: {hotel.activeRooms}{coverage.maximumRoomsPerHotel !== null ? ` / ${coverage.maximumRoomsPerHotel}` : ''}; usuarios activos: {hotel.activeUsers}{coverage.maximumUsersPerHotel !== null ? ` / ${coverage.maximumUsersPerHotel}` : ''}</span>
        </label>
      </div>)}
      {coverage.maximumHotels !== null && <button type="button" className="btn btn-primary mt-3" disabled={selection === null || selected.length > coverage.maximumHotels} onClick={() => { setSaveError(null); setConfirm(true); }}>Guardar cobertura</button>}
    </fieldset>
    <ConfirmDialog open={confirm} title="Cambiar cobertura" message="Los hoteles que desmarques conservarán sus datos, pero no estarán cubiertos por tu suscripción." confirmLabel="Guardar cobertura" busy={saving} error={saveError} onCancel={() => setConfirm(false)} onConfirm={() => { void save(); }} />
    <ConfirmDialog open={checkoutConfirm} title="Continuar con el checkout de prueba" message={`Se abrirá Mercado Pago para una suscripción de prueba de ${money(Number(coverage.testCheckout?.monthlyPrice))} por mes. Usá exclusivamente cuentas y medios de pago de prueba. La confirmación no activa automáticamente el acceso.`} confirmLabel="Continuar" busy={checkoutBusy} error={checkoutError} onCancel={() => setCheckoutConfirm(false)} onConfirm={() => { void startCheckout(); }} />
  </div></div>;
}
