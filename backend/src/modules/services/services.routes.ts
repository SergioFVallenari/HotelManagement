import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from './services.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listServices);
router.post('/', requireAdmin, createService);
router.put('/:id', requireAdmin, updateService);
router.delete('/:id', requireAdmin, deleteService);

export default router;