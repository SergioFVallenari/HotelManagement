import { Router } from 'express';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
import { createRecipients, deleteRecipient, listRecipients, updateRecipient } from './recipients.controller.js';

const router = Router();

router.use(requireAuth, requireOwnerOrAdmin);

router.get('/', listRecipients);
router.post('/', createRecipients);
router.patch('/:id', updateRecipient);
router.delete('/:id', deleteRecipient);

export default router;
