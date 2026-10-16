import { Router } from 'express';
import { requireAuth, requireOwner } from '../../middleware/auth.js';
import { login, loginForCompanies, logout, me, switchCompany } from './auth.controller.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

router.post('/login',rateLimiter(5, 15 * 60 * 1000), loginForCompanies);
router.post('/login/company', rateLimiter(5, 15 * 60 * 1000), login);
router.post('/switch-company', requireAuth, requireOwner, switchCompany);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;