import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// User preferences routes
router.get('/preferences/dashboard', userController.getDashboardPreferences);
router.put('/preferences/dashboard', userController.updateDashboardPreferences);
router.get('/preferences/notifications', userController.getNotificationPreferences);
router.put('/preferences/notifications', userController.updateNotificationPreferences);

// User profile routes
router.get('/profile', userController.getUserProfile);
router.put('/profile', userController.updateUserProfile);

export default router;