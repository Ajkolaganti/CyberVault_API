import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/rbac.js';
import * as policyController from '../controllers/policyController.js';

const router = Router();
router.use(authenticate, authorizeRoles('Admin'));

router.get('/', policyController.list);
router.post('/', policyController.create);
router.put('/:id', policyController.update);
router.delete('/:id', policyController.remove);

export default router; 