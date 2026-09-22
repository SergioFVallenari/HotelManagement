import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { createGuest, getGuest, listGuests, updateGuest } from './guests.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listGuests);
router.get('/:id', getGuest);
router.post('/', createGuest);
router.put('/:id', updateGuest);

export default router;