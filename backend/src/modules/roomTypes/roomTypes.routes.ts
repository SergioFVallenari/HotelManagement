import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import {
  createRoomType,
  deleteRoomType,
  getRoomType,
  listRoomTypes,
  updateRoomType,
} from './roomTypes.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listRoomTypes);
router.get('/:id', getRoomType);
router.post('/', requireAdmin, createRoomType);
router.put('/:id', requireAdmin, updateRoomType);
router.delete('/:id', requireAdmin, deleteRoomType);

export default router;