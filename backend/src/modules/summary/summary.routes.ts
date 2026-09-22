import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { summary } from './summary.controller.js';

const router = Router();

router.get('/', requireAuth, summary);

export default router;