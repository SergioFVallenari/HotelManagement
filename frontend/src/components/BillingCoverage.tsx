import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { dateTimeShort } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';

type Coverage = {
  status: 'TRIALING' | 'EXPIRED' | 'GRANDFATHERED' | 'ACTIVE';
  daysRemaining: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  maximumHotels: number | null;
  maximumRoomsPerHotel: number | null;
  maximumUsersPerHotel: number | null;
  hotels: Array<{ id: number; name: string; covered: boolean; activeRooms: number; activeUsers: number }>;
};

export function BillingCoverage() {
  const { data, error, loading, reload } = useApi<{ data: Coverage }>('/billing/coverage');
  const [selection, setSelection] = useState<number[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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

  if (loading) return <p>Cargando suscripción…</p>;
  if (error || !coverage) return <div className="alert alert-danger">{error ?? 'No se pudo cargar la suscripción.'} <button type="button" className="btn btn-sm btn-outline-danger" onClick={reload}>Reintentar</button></div>;

  return <div className="card shadow-sm"><div className="card-body">
    <h2 className="h5">Suscripción y hoteles</h2>
    {coverage.status === 'GRANDFATHERED' ? <p>Tu cuenta conserva el acceso anterior sin fecha de vencimiento.</p> : <>
      <p>{coverage.status === 'EXPIRED' ? 'Tu prueba venció.' : coverage.status === 'ACTIVE' ? `Suscripción activa${coverage.currentPeriodEnd ? ` hasta ${dateTimeShort(coverage.currentPeriodEnd)}` : ''}.` : `Prueba gratuita: ${coverage.daysRemaining} días restantes.`} {coverage.status !== 'ACTIVE' && coverage.trialEndsAt && <>Vencimiento: {dateTimeShort(coverage.trialEndsAt)}.</>}</p>
      <p>Podés seleccionar hasta {coverage.maximumHotels} hoteles. Los demás conservan sus datos.</p>
    </>}
    <div className="alert alert-info">La contratación de planes y los pagos todavía no están disponibles. Las restricciones operativas están en etapa de prueba.</div>
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
  </div></div>;
}
