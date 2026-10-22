import { Router } from 'express';
import { requireAdmin, requireAuth, requireOwner } from '../../middleware/auth.js';
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
router.post('/auth-url', requireOwner, buildAuthUrlHandler);
router.delete('/connection', requireOwner, disconnectHandler);

export default router;