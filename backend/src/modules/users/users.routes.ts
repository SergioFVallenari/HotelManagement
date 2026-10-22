import { Router } from 'express';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
import { createUser, listUsers } from './users.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireOwnerOrAdmin, listUsers);
router.post('/', requireOwnerOrAdmin, createUser);

export default router;
