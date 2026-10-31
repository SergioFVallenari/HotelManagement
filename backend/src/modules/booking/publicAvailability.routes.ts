import { Router } from 'express';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { getPublicAvailabilityHandler, getPublicBookingPageConfigHandler } from './booking.controller.js';

const router = Router();
router.get('/:slug/config', rateLimiter(30, 10 * 60 * 1000), getPublicBookingPageConfigHandler);
router.get('/:slug', rateLimiter(30, 10 * 60 * 1000), getPublicAvailabilityHandler);
export default router;
