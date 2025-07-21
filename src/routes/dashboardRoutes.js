import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = Router();

router.use(authenticate);

router.get('/stats', dashboardController.getStats);
router.get('/alerts', dashboardController.getAlerts);

export default router; 