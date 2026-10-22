import { Router } from 'express';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { env } from '../../config/env.js';
import { ChannelType } from '../../generated/prisma/client.js';
import { createWebhookHandler } from '../channels/channels.controller.js';
import { callbackHandler, disconnectHandler, getAuthUrlHandler, getStatusHandler, syncHandler } from './instagram.controller.js';

const router = Router();

// Públicas
router.get('/integrations/instagram/callback', callbackHandler);
router.get('/integrations/instagram/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = env.ig.webhookVerifyToken;

  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }

  console.warn('[instagram] falló la verificación del webhook');
  res.sendStatus(403);
});
router.post('/integrations/instagram/webhook', createWebhookHandler(ChannelType.INSTAGRAM));

// Protegidas
router.use(requireAuth);
router.get('/integrations/instagram/auth/url', requireOwnerOrAdmin, getAuthUrlHandler);
router.get('/integrations/instagram/status', getStatusHandler);
router.post('/integrations/instagram/sync', rateLimiter(20, 60_000), syncHandler);
router.delete('/integrations/instagram/connection', requireOwnerOrAdmin, disconnectHandler);

export default router;
