/**
 * CPM Routes
 * API routes for Central Policy Manager operations
 */

import express from 'express';
import * as cpmController from '../controllers/cpmController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validation.js';

const router = express.Router();

// Apply authentication to all CPM routes
router.use(authenticate);

// CPM Status and Monitoring
router.get('/status', cpmController.getStatus);
router.get('/configuration', cpmController.getConfiguration);

// Credential Verification Management
router.post('/verify', 
  validateRequest({
    body: {
      credential_ids: { type: 'array', required: true },
      force: { type: 'boolean', required: false }
    }
  }),
  cpmController.triggerVerification
);

// Verification History
router.get('/credentials/:credentialId/history', cpmController.getVerificationHistory);

// Credentials Requiring Attention
router.get('/credentials/attention', cpmController.getCredentialsRequiringAttention);

// Batch Operations (Admin only)
router.post('/credentials/batch-update',
  validateRequest({
    body: {
      credential_ids: { type: 'array', required: true },
      status: { type: 'string', required: true, enum: ['pending', 'verified', 'failed', 'expired'] },
      reason: { type: 'string', required: false }
    }
  }),
  cpmController.batchUpdateStatus
);

export default router;