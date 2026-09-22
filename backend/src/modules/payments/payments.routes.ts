import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { deletePaymentHandler } from './payments.controller.js';

const router = Router();

router.use(requireAuth);

router.delete('/:id', requireAdmin, deletePaymentHandler);

export default router;