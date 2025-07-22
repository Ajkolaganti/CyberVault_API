import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import * as accountController from '../controllers/accountController.js';
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

// Create account
router.post(
  '/',
  [
    body('system_type')
      .isIn(['Windows', 'Linux', 'Database', 'Cloud', 'Network', 'Application', 'Security', 'Directory', 'Website', 'Operating System', 'Certificates', 'Misc'])
      .withMessage('System type must be one of the allowed values'),
    body('hostname_ip')
      .notEmpty()
      .withMessage('Hostname/IP is required')
      .isLength({ min: 1, max: 255 })
      .withMessage('Hostname/IP must be between 1 and 255 characters'),
    body('username')
      .notEmpty()
      .withMessage('Username is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Username must be between 1 and 100 characters'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
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

export default router;
