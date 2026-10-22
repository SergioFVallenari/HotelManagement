import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import {
  historyHandler,
  listConversationsHandler,
  listMessagesHandler,
  markReadHandler,
  sendMessageHandler,
} from './channels.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/conversations', listConversationsHandler);
router.get('/conversations/:id/messages', listMessagesHandler);
router.post('/conversations/:id/messages', sendMessageHandler);
router.post('/conversations/:id/read', markReadHandler);
router.post('/conversations/:id/history', rateLimiter(20, 60_000), historyHandler);

export default router;
