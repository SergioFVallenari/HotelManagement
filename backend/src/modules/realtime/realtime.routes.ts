import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getConfigHandler } from './realtime.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/config', getConfigHandler);

export default router;
