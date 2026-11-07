import { Router } from 'express';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import {
  draftHandler,
  reservationChatHandler,
  confirmReservationChatHandler,
  getAiConfigHandler,
  getAiSettingsHandler,
  updateAiSettingsHandler,
} from './ai.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/ai/config', getAiConfigHandler);
router.post('/ai/reservations/chat', rateLimiter(10, 60 * 1000), reservationChatHandler);
router.post('/ai/reservations/confirm', rateLimiter(10, 60 * 1000), confirmReservationChatHandler);
router.get('/ai/settings', getAiSettingsHandler);
router.put('/ai/settings', requireOwnerOrAdmin, updateAiSettingsHandler);
router.post('/conversations/:id/ai/draft', rateLimiter(10, 60 * 1000), draftHandler);

export default router;
