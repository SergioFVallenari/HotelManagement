import { Router } from 'express';
import { requireAuth, requireOwner } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { createCompany, listCompanies, listOwnedCompanies } from './companies.controller.js';

const router = Router();

router.get('/', requireAuth, rateLimiter(30, 60 * 1000), listCompanies);
router.get('/owned', requireAuth, requireOwner, listOwnedCompanies);
router.post('/', requireAuth, requireOwner, createCompany);

export default router;
