import { Link, useLocation } from 'react-router-dom';
import { useApi } from '../api/useApi';
import { dateTimeShort } from '../lib/format';

type Subscription = {
  status: 'TRIALING' | 'EXPIRED' | 'GRANDFATHERED' | 'ACTIVE';
  daysRemaining: number | null;
  trialEndsAt: string | null;
  covered: boolean;
  needsHotelSelection: boolean;
  currentPeriodEnd: string | null;
};

export function SubscriptionBanner({ companyId }: { companyId: number }) {
  const { data } = useApi<{ data: Subscription }>('/billing/subscription', { pollMs: 300_000 });
  const location = useLocation();
  const subscription = data?.data;
  if (!subscription || (subscription.status === 'GRANDFATHERED' && subscription.covered)) return null;
  const expired = subscription.status === 'EXPIRED';
  return <div className={`alert ${expired || !subscription.covered || subscription.needsHotelSelection ? 'alert-warning' : 'alert-info'} mb-3`} role="status" key={companyId}>
    {subscription.needsHotelSelection
      ? 'Elegí un solo hotel para cubrir con tu plan pago. Los demás conservan sus datos.'
      : !subscription.covered
      ? 'Este hotel no está cubierto por tu suscripción. Sus datos se conservan.'
      : expired
        ? 'Tu prueba gratuita venció. La contratación todavía no está disponible.'
        : subscription.status === 'ACTIVE'
          ? `Tu suscripción está activa${subscription.currentPeriodEnd ? ` hasta ${dateTimeShort(subscription.currentPeriodEnd)}` : ''}.`
        : `Tu prueba gratuita está activa: ${subscription.daysRemaining} ${subscription.daysRemaining === 1 ? 'día restante' : 'días restantes'}${subscription.trialEndsAt ? `, hasta ${dateTimeShort(subscription.trialEndsAt)}` : ''}.`}
    {location.pathname !== '/settings' && <> <Link to="/settings?tab=suscripcion" className="alert-link">Ver suscripción y hoteles</Link></>}
  </div>;
}
