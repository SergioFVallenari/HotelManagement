import { Router } from 'express';
import { requireAuth, requireOwner } from '../../middleware/auth.js';
import { checkout, getCoverage, getSubscription, updateCoverage } from './billing.controller.js';
import { receiveTestBillingWebhook } from './billing.webhook.js';

const router = Router();

router.post('/webhook', receiveTestBillingWebhook);
router.get('/subscription', requireAuth, requireOwner, getSubscription);
router.get('/coverage', requireAuth, requireOwner, getCoverage);
router.put('/coverage', requireAuth, requireOwner, updateCoverage);
router.post('/checkout', requireAuth, requireOwner, checkout);

export default router;
