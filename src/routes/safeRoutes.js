import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import * as safeController from '../controllers/safeController.js';
import { authenticate } from '../middlewares/auth.js';

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

const router = Router();

router.use(authenticate);

// Create safe
router.post(
  '/',
  [
    body('name')
      .notEmpty()
      .withMessage('Safe name is required')
      .isLength({ min: 3, max: 100 })
      .withMessage('Safe name must be between 3 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('safe_type')
      .optional()
      .isIn(['standard', 'shared', 'department', 'application'])
      .withMessage('Safe type must be one of: standard, shared, department, application'),
    body('access_level')
      .optional()
      .isIn(['private', 'team', 'department', 'public'])
      .withMessage('Access level must be one of: private, team, department, public'),
    body('settings')
      .optional()
      .isObject()
      .withMessage('Settings must be a valid JSON object')
  ],
  handleValidationErrors,
  safeController.create
);

// List safes
router.get('/', safeController.list);

// Get safe statistics
router.get('/statistics', safeController.statistics);

// Get safe by ID
router.get('/:id', safeController.getById);

// Update safe
router.put(
  '/:id',
  [
    body('name')
      .optional()
      .isLength({ min: 3, max: 100 })
      .withMessage('Safe name must be between 3 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('safe_type')
      .optional()
      .isIn(['standard', 'shared', 'department', 'application'])
      .withMessage('Safe type must be one of: standard, shared, department, application'),
    body('access_level')
      .optional()
      .isIn(['private', 'team', 'department', 'public'])
      .withMessage('Access level must be one of: private, team, department, public'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'archived'])
      .withMessage('Status must be one of: active, inactive, archived'),
    body('settings')
      .optional()
      .isObject()
      .withMessage('Settings must be a valid JSON object')
  ],
  handleValidationErrors,
  safeController.update
);

// Delete safe
router.delete('/:id', safeController.remove);

// Safe permission management
router.post(
  '/:id/permissions',
  [
    body('userId')
      .notEmpty()
      .isUUID()
      .withMessage('Valid user ID is required'),
    body('permission_level')
      .isIn(['read', 'write', 'admin', 'owner'])
      .withMessage('Permission level must be one of: read, write, admin, owner')
  ],
  handleValidationErrors,
  safeController.grantPermission
);

router.get('/:id/permissions', safeController.listPermissions);
router.delete('/:id/permissions/:permissionId', safeController.revokePermission);

// Safe activity log
router.get('/:id/activity', safeController.listActivity);

// Safe accounts management
router.get('/:id/accounts', safeController.listAccounts);

// Move accounts between safes
router.post(
  '/move-accounts',
  [
    body('sourceId')
      .notEmpty()
      .isUUID()
      .withMessage('Valid source safe ID is required'),
    body('targetId')
      .notEmpty()
      .isUUID()
      .withMessage('Valid target safe ID is required'),
    body('accountIds')
      .isArray({ min: 1 })
      .withMessage('At least one account ID is required')
      .custom((accountIds) => {
        return accountIds.every(id => typeof id === 'string' && id.length > 0);
      })
      .withMessage('All account IDs must be valid strings')
  ],
  handleValidationErrors,
  safeController.moveAccounts
);

export default router;
