import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { login, loginForCompanies, logout, me } from './auth.controller.js';

const router = Router();

router.post('/login', loginForCompanies);
router.post('/login/company', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;