import { Router } from 'express';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { loginForCompanies } from '../auth/auth.controller.js';
import { calendar } from '../calendar/calendar.controller.js';
import { mobileLoginCompany } from './mobile.controller.js';
import { requireMobileAuth } from './mobile.middleware.js';

const router = Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/auth/login', rateLimiter(5, 15 * 60 * 1000), loginForCompanies);
router.post('/auth/login/company', rateLimiter(5, 15 * 60 * 1000), mobileLoginCompany);
router.get('/calendar', requireMobileAuth, calendar);

export default router;
