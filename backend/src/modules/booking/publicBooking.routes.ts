import { Router } from 'express';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import {
  createReceiptUploadHandler,
  getPublicQuoteHandler,
  getPublicReservationStatusHandler,
  submitBookingHandler,
} from './booking.controller.js';

const router = Router();
router.get('/status/:code', rateLimiter(10, 10 * 60 * 1000), getPublicReservationStatusHandler);

// El link se comparte por WhatsApp y lo abre el huesped sin cuenta: el token
// del path es la unica credencial, por eso el limite es por IP y por ruta.
router.get('/:token', rateLimiter(60, 10 * 60 * 1000), getPublicQuoteHandler);
router.post('/:token/receipt', rateLimiter(20, 10 * 60 * 1000), createReceiptUploadHandler);
router.post('/:token', rateLimiter(20, 10 * 60 * 1000), submitBookingHandler);

export default router;
