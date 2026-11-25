import { Router } from 'express';
import { requireAuth, requireOwner } from '../../middleware/auth.js';
import { checkout, getCoverage, getSubscription, updateCoverage } from './billing.controller.js';
import { receiveTestBillingWebhook } from './billing.webhook.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { billingAvailable } from './billing.availability.js';

const router = Router();

router.use((_req, _res, next) => {
  if (!billingAvailable(env.appEnv)) return next(new AppError(404, 'BILLING_NO_DISPONIBLE', 'La gestión de suscripciones no está disponible.'));
  next();
});

router.post('/webhook', receiveTestBillingWebhook);
router.get('/subscription', requireAuth, requireOwner, getSubscription);
router.get('/coverage', requireAuth, requireOwner, getCoverage);
router.put('/coverage', requireAuth, requireOwner, updateCoverage);
router.post('/checkout', requireAuth, requireOwner, checkout);

export default router;
