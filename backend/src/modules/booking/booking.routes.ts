import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  cancelBookingLinkHandler,
  createBookingLinkHandler,
  getBookingLinkHandler,
  listBookingLinksHandler,
} from './booking.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listBookingLinksHandler);
router.post('/', createBookingLinkHandler);
router.get('/:id', getBookingLinkHandler);
router.post('/:id/cancel', cancelBookingLinkHandler);

export default router;
