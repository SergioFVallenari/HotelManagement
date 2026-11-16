import { Router } from 'express';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { loginForCompanies } from '../auth/auth.controller.js';
import { calendar } from '../calendar/calendar.controller.js';
import { mobileLoginCompany, mobileLogout, mobileRefresh } from './mobile.controller.js';
import { requireMobileAuth } from './mobile.middleware.js';
import { checkIn, checkOut } from '../reservations/reservations.controller.js';

const router = Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/auth/login', rateLimiter(5, 15 * 60 * 1000), loginForCompanies);
router.post('/auth/login/company', rateLimiter(5, 15 * 60 * 1000), mobileLoginCompany);
router.post('/auth/refresh', rateLimiter(30, 15 * 60 * 1000), mobileRefresh);
router.post('/auth/logout', rateLimiter(30, 15 * 60 * 1000), mobileLogout);
router.get('/calendar', requireMobileAuth, calendar);
router.post('/reservations/:id/check-in', requireMobileAuth, checkIn);
router.post('/reservations/:id/check-out', requireMobileAuth, checkOut);
export default router;
