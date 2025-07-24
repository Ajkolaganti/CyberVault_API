import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = Router();

router.use(authenticate);

router.get('/stats', dashboardController.getStats);
router.get('/alerts', dashboardController.getAlerts);
router.get('/validation', dashboardController.getValidationData);
router.get('/analytics', dashboardController.getAnalyticsData);
router.get('/jit-health', dashboardController.getJitHealthData);
router.get('/system-health', dashboardController.getSystemHealthData);

export default router; 