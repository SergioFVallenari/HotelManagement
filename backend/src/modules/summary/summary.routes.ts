import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { operations, summary } from './summary.controller.js';

const router = Router();

router.get('/', requireAuth, summary);
router.get('/operations', requireAuth, operations);

export default router;
