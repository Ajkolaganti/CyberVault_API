import { Router } from 'express';
import * as healthController from '../controllers/healthController.js';

const router = Router();

// Basic health check endpoint (no authentication required)
router.get('/', healthController.getSystemHealth);

// Detailed health check (no authentication required for monitoring)
router.get('/detailed', healthController.getDetailedHealth);

export default router;