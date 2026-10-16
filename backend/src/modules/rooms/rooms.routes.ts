import { Router } from 'express';
import { requireAuth, requireAdmin, requireOwnerOrAdmin } from '../../middleware/auth.js';
import {
  availableRooms,
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  updateRoom,
} from './rooms.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/available', availableRooms);
router.get('/', listRooms);
router.get('/:id', getRoom);
router.post('/', requireOwnerOrAdmin, createRoom);
router.put('/:id', requireAdmin, updateRoom);
router.delete('/:id', requireAdmin, deleteRoom);

export default router;