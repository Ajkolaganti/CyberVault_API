import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as discoveryController from '../controllers/discoveryController.js';

const router = Router();

router.use(authenticate);

router.get('/', discoveryController.list);
router.get('/:id', discoveryController.getById);

export default router; 