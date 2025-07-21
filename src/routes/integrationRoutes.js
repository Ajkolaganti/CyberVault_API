import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/rbac.js';
import * as integrationController from '../controllers/integrationController.js';

const router = Router();
router.use(authenticate, authorizeRoles('Admin'));

router.get('/', integrationController.list);
router.post('/', integrationController.create);
router.put('/:id', integrationController.update);
router.delete('/:id', integrationController.remove);

export default router; 