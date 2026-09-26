import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.js';
import {
  buildAuthUrlHandler,
  disconnectHandler,
  getConnectionHandler,
  oauthCallbackHandler,
  webhookHandler,
} from './mp.controller.js';

const router = Router();

router.get('/oauth/callback', oauthCallbackHandler);
router.post('/webhook', webhookHandler);

router.use(requireAuth);

router.get('/connection', getConnectionHandler);
router.post('/auth-url', requireAdmin, buildAuthUrlHandler);
router.delete('/connection', requireAdmin, disconnectHandler);

export default router;