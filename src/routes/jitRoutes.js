import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import * as jitController from '../controllers/jitController.js';
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

router.post(
  '/',
  [
    body('resource').notEmpty().withMessage('Resource is required'),
    body('system').optional().isString().withMessage('System must be a string'),
    body('reason')
      .notEmpty()
      .withMessage('Reason is required')
      .isLength({ min: 3, max: 500 })
      .withMessage('Reason must be between 3 and 500 characters')
      .trim(),
    body('durationMinutes').optional().isInt({ min: 1, max: 480 }).withMessage('Duration must be between 1-480 minutes (8 hours max)')
  ],
  handleValidationErrors,
  jitController.request
);

router.get('/', jitController.list);
router.post('/:id/revoke', jitController.revoke);

export default router; 