import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { login, me } from './auth.controller.js';

const router = Router();

router.post('/login', login);
router.get('/me', requireAuth, me);

export default router;