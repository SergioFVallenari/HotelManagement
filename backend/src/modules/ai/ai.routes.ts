import { Router } from 'express';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import {
  draftHandler,
  getAiConfigHandler,
  getAiSettingsHandler,
  updateAiSettingsHandler,
} from './ai.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/ai/config', getAiConfigHandler);
router.get('/ai/settings', getAiSettingsHandler);
router.put('/ai/settings', requireOwnerOrAdmin, updateAiSettingsHandler);
router.post('/conversations/:id/ai/draft', rateLimiter(10, 60 * 1000), draftHandler);

export default router;
