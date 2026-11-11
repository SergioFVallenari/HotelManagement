import { Router } from 'express';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { getPublicAvailabilityHandler, getPublicBookingPageConfigHandler, getPublicCalendarHandler } from './booking.controller.js';

const router = Router();
router.get('/:slug/calendar', rateLimiter(120, 10 * 60 * 1000), getPublicCalendarHandler);
router.get('/:slug/config', rateLimiter(30, 10 * 60 * 1000), getPublicBookingPageConfigHandler);
router.get('/:slug', rateLimiter(30, 10 * 60 * 1000), getPublicAvailabilityHandler);
export default router;
