import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as discoveryController from '../controllers/discoveryController.js';

const router = Router();

// All discovery routes require authentication
router.use(authenticate);

// Discovery Targets Endpoints
router.post('/targets', discoveryController.createTarget);
router.get('/targets', discoveryController.listTargets);
router.get('/targets/:id', discoveryController.getTargetById);

// Discovery Scans Endpoints
router.post('/targets/:targetId/scan', discoveryController.initiateDiscoveryScan);
router.get('/scans', discoveryController.listScans);
router.get('/scans/:scanId', discoveryController.getScanById);

// Discovered Accounts Endpoints
router.get('/accounts', discoveryController.listDiscoveredAccounts);
router.post('/accounts/approve', discoveryController.approveDiscoveredAccounts);
router.post('/accounts/reject', discoveryController.rejectDiscoveredAccounts);

// Discovery Statistics
router.get('/statistics', discoveryController.getDiscoveryStatistics);

// Legacy endpoints for backward compatibility
router.get('/', discoveryController.list);
router.get('/:id', discoveryController.getById);

export default router; 