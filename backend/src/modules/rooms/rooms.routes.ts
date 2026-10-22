import { Router } from 'express';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
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
router.put('/:id', requireOwnerOrAdmin, updateRoom);
router.delete('/:id', requireOwnerOrAdmin, deleteRoom);

export default router;