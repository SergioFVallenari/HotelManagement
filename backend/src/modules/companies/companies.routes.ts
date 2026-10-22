import { Router } from 'express';
import { requireAuth, requireOwner, requireOwnerOrAdmin } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import {
  createCompany,
  getCurrentCompany,
  listCompanies,
  listOwnedCompanies,
  updateCompanySettings,
} from './companies.controller.js';

const router = Router();

router.get('/', requireAuth, rateLimiter(30, 60 * 1000), listCompanies);
router.get('/owned', requireAuth, requireOwner, listOwnedCompanies);
router.post('/', requireAuth, requireOwner, createCompany);
router.get('/current', requireAuth, getCurrentCompany);
router.patch('/current', requireAuth, requireOwnerOrAdmin, updateCompanySettings);

export default router;
