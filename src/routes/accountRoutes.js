import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import * as accountController from '../controllers/accountController.js';
import { authenticate } from '../middlewares/auth.js';
import * as safeService from '../services/safeService.js';

// Field mapping middleware to handle frontend field names
const mapFrontendFields = async (req, res, next) => {
  try {
    // Map hostname to hostname_ip if hostname_ip is not provided
    if (req.body.hostname && !req.body.hostname_ip) {
      req.body.hostname_ip = req.body.hostname;
    }
    
    // Map safe_name to safe_id by looking up the safe
    if (req.body.safe_name && !req.body.safe_id) {
      const safes = await safeService.listSafes({
        ownerId: req.user.id,
        role: req.user.role
      });
      const safe = safes.find(s => s.name === req.body.safe_name);
      if (safe) {
        req.body.safe_id = safe.id;
      } else {
        return res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'safe_name', message: 'Safe not found' }]
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in field mapping middleware:', error);
    return res.status(500).json({ error: 'Internal server error during field mapping' });
  }
};

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

// Create account
router.post(
  '/',
  mapFrontendFields,
  [
    body('system_type')
      .isIn(['Windows', 'Linux', 'Database', 'Cloud', 'Network', 'Application', 'Security', 'Directory', 'Website', 'Operating System', 'Certificates', 'Misc', 'Oracle DB', 'AWS', 'Azure'])
      .withMessage('System type must be one of the allowed values'),
    body('hostname_ip')
      .optional()
      .isLength({ min: 1, max: 255 })
      .withMessage('Hostname/IP must be between 1 and 255 characters')
      .matches(/^[a-zA-Z0-9.-]+$/)
      .withMessage('Hostname/IP contains invalid characters'),
    body('hostname')
      .optional()
      .isLength({ min: 1, max: 255 })
      .withMessage('Hostname must be between 1 and 255 characters')
      .matches(/^[a-zA-Z0-9.-]+$/)
      .withMessage('Hostname contains invalid characters'),
    body('port')
      .optional()
      .isInt({ min: 1, max: 65535 })
      .withMessage('Port must be between 1 and 65535'),
    body('username')
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Username must be between 1 and 100 characters')
      .trim(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8, max: 256 })
      .withMessage('Password must be between 8 and 256 characters long'),
    body('connection_method')
      .optional()
      .isIn(['RDP', 'SSH', 'SQL', 'HTTPS', 'HTTP', 'SFTP', 'Telnet', 'VNC', 'PowerShell', 'WinRM', 'Custom'])
      .withMessage('Connection method must be one of the allowed values'),
    body('platform_id')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Platform ID must not exceed 100 characters')
      .trim(),
    body('account_type')
      .optional()
      .isIn(['Local', 'Domain', 'Service', 'Application', 'Database', 'System', 'Shared', 'Emergency'])
      .withMessage('Account type must be one of the allowed values'),
    body('safe_id')
      .optional()
      .isUUID()
      .withMessage('Safe ID must be a valid UUID'),
    body('safe_name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Safe name must be between 1 and 100 characters')
      .trim(),
    body('rotation_policy')
      .optional()
      .isObject()
      .withMessage('Rotation policy must be an object'),
    body('account_description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters')
      .trim(),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array')
  ],
  handleValidationErrors,
  accountController.create
);

// List accounts
router.get('/', accountController.list);

// Get account by ID
router.get('/:id', accountController.getById);

// Update account
router.put(
  '/:id',
  mapFrontendFields,
  [
    body('system_type')
      .optional()
      .isIn(['Windows', 'Linux', 'Database', 'Cloud', 'Network', 'Application', 'Security', 'Directory', 'Website', 'Operating System', 'Certificates', 'Misc'])
      .withMessage('System type must be one of the allowed values'),
    body('hostname_ip')
      .optional()
      .isLength({ min: 1, max: 255 })
      .withMessage('Hostname/IP must be between 1 and 255 characters'),
    body('username')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Username must be between 1 and 100 characters'),
    body('password')
      .optional()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
    body('rotation_policy')
      .optional()
      .isObject()
      .withMessage('Rotation policy must be an object'),
    body('account_description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'expired', 'rotation_required'])
      .withMessage('Status must be one of the allowed values')
  ],
  handleValidationErrors,
  accountController.update
);

// Delete account
router.delete('/:id', accountController.remove);

// Rotate account password
router.post('/:id/rotate', accountController.rotatePassword);

// Get rotation history
router.get('/:id/history', accountController.rotationHistory);

// Validate account credentials (test connectivity)
router.post('/:id/validate', accountController.validateAccount);

// Get validation history
router.get('/:id/validation-history', accountController.getValidationHistory);

export default router;
