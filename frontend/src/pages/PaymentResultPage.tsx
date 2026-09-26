import { useSearchParams } from 'react-router-dom';
import { IconBuildingSkyscraper, IconCircleCheck, IconClockHour4, IconCircleX } from '@tabler/icons-react';

type PaymentOutcome = 'approved' | 'pending' | 'rejected';

function resolveOutcome(params: URLSearchParams): PaymentOutcome {
  const raw = (params.get('collection_status') ?? params.get('status') ?? '').toLowerCase();
  if (raw === 'approved' || raw === 'accredited') return 'approved';
  if (raw === 'pending' || raw === 'in_process' || raw === 'authorized') return 'pending';
  if (raw) return 'rejected';
  return 'pending';
}

const COPY: Record<PaymentOutcome, { title: string; body: string; icon: typeof IconCircleCheck; variant: string }> = {
  approved: {
    title: 'Pago acreditado',
    body: 'Recibimos tu pago. La reserva quedó confirmada y el hotel ya puede verte en su sistema.',
    icon: IconCircleCheck,
    variant: 'text-success',
  },
  pending: {
    title: 'Pago en revisión',
    body: 'Estamos esperando la confirmación de MercadoPago. Te avisamos apenas el pago se acredite; no hace falta que pagues de nuevo.',
    icon: IconClockHour4,
    variant: 'text-warning',
  },
  rejected: {
    title: 'No pudimos procesar el pago',
    body: 'MercadoPago rechazó la operación. Podés reintentar con otro medio de pago desde el link que te pasó el hotel.',
    icon: IconCircleX,
    variant: 'text-danger',
  },
};

export function PaymentResultPage() {
  const [params] = useSearchParams();
  const outcome = resolveOutcome(params);
  const { title, body, icon: Icon, variant } = COPY[outcome];
  const reservation = params.get('reservation');
  const paymentId = params.get('payment_id') ?? params.get('collection_id');

  return (
    <div className="login-screen">
      <div className="login-card payment-result">
        <div className="login-brand">
          <span className="brand-icon"><IconBuildingSkyscraper size={26} /></span>
          <h1>Hotel Manager</h1>
        </div>
        <div className={`payment-result-icon ${variant}`}>
          <Icon size={44} />
        </div>
        <h2 className="h5 text-center mb-2">{title}</h2>
        <p className="text-secondary text-center mb-3">{body}</p>
        {reservation && (
          <p className="text-center text-secondary mb-1">
            Reserva <code>{reservation}</code>
          </p>
        )}
        {paymentId && <p className="payment-result-id">Pago {paymentId}</p>}
      </div>
    </div>
  );
}
