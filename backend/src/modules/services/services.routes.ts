import { Router } from 'express';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
import {
  createService,
  deleteService,
  listServices,
  updateService,
} from './services.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listServices);
router.post('/', requireOwnerOrAdmin, createService);
router.put('/:id', requireOwnerOrAdmin, updateService);
router.delete('/:id', requireOwnerOrAdmin, deleteService);

export default router;