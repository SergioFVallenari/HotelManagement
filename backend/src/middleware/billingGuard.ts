import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { requireAuth } from './auth.js';
import { assertBillingOperation } from '../modules/billing/billing.guard.js';
import { requiresBillingWriteCheck } from '../lib/billingRoutes.js';

export function billingWriteGuard(req: Request, res: Response, next: NextFunction): void {
  if (!env.billingEnforcementTesting || !requiresBillingWriteCheck(req.method, req.path)) return next();
  requireAuth(req, res, () => {
    void assertBillingOperation(req.user!.companyId, 'MODIFICAR_DATOS', req.user!.role).then(() => next(), next);
  });
}
