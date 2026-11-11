import { round2 } from '../../lib/money.js';

export interface DeletionState {
  status: string;
  hasStayActivity: boolean;
  refundEligible: boolean;
  refunded: boolean;
  refundAmount: number | null;
  mpOrderId: string | null;
  mpCheckoutUrl: string | null;
  payments: { amount: number; method: string }[];
}

export function reservationDeletionError(state: DeletionState): string | null {
  if (state.mpOrderId || state.mpCheckoutUrl || state.payments.some((payment) => payment.method === 'MERCADOPAGO')) return 'No se puede eliminar una reserva vinculada a MercadoPago.';
  if (state.hasStayActivity || state.status === 'CHECKED_IN' || state.status === 'CHECKED_OUT') return 'No se puede eliminar una reserva con check-in o check-out registrado.';
  if (state.payments.length) {
    const paid = round2(state.payments.reduce((sum, payment) => sum + payment.amount, 0));
    if (state.status !== 'CANCELLED' || (state.refundEligible && (!state.refunded || state.refundAmount === null || round2(state.refundAmount) < paid))) return 'Cancelá la reserva y registrá la devolución total si corresponde antes de eliminarla.';
  }
  return null;
}
