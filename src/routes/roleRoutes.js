import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/rbac.js';
import * as roleController from '../controllers/roleController.js';

const router = Router();
router.use(authenticate, authorizeRoles('Admin'));

router.get('/', roleController.list);
router.patch('/:id', [body('role').isIn(['Admin', 'Manager', 'User'])], roleController.update);

export default router; 