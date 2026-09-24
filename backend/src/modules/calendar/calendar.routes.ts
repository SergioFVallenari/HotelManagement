import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { calendar } from './calendar.controller.js';

const router = Router();

router.get('/', requireAuth, calendar);

export default router;