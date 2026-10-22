import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  approveReservationHandler,
  cancelReservation,
  checkIn,
  checkOut,
  createReservationHandler,
  getReceiptHandler,
  getReservationHandler,
  listReservations,
  markRefundedHandler,
  rejectReservationHandler,
  updateReservationHandler,
} from './reservations.controller.js';
import { createPaymentHandler } from '../payments/payments.controller.js';
import { createReservationOrderHandler } from '../mercadopago/mp.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listReservations);
router.post('/', createReservationHandler);
router.get('/:id', getReservationHandler);
router.patch('/:id', updateReservationHandler);
router.post('/:id/check-in', checkIn);
router.post('/:id/check-out', checkOut);
router.post('/:id/cancel', cancelReservation);
router.post('/:id/refund', markRefundedHandler);
router.post('/:id/payments', createPaymentHandler);
router.post('/:id/mp/order', createReservationOrderHandler);
router.get('/:id/receipt', getReceiptHandler);
router.post('/:id/approve', approveReservationHandler);
router.post('/:id/reject', rejectReservationHandler);

export default router;
