import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { requireInstagramMessaging } from '../../middleware/featureFlags.js';
import {
  historyHandler,
  listConversationsHandler,
  listMessagesHandler,
  markReadHandler,
  sendMessageHandler,
} from './channels.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/conversations', requireInstagramMessaging, listConversationsHandler);
router.get('/conversations/:id/messages', requireInstagramMessaging, listMessagesHandler);
router.post('/conversations/:id/messages', requireInstagramMessaging, sendMessageHandler);
router.post('/conversations/:id/read', requireInstagramMessaging, markReadHandler);
router.post('/conversations/:id/history', requireInstagramMessaging, rateLimiter(20, 60_000), historyHandler);

export default router;
