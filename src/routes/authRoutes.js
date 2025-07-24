import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { endpointLogger } from '../middlewares/endpointLogger.js';

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 50, // Very restrictive for production, relaxed for dev
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: Math.round(15 * 60)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in development
  skip: (req) => process.env.NODE_ENV !== 'production'
});

const router = Router();

router.post(
  '/register',
  endpointLogger('AUTH_REGISTER', { sensitive: true, trackFailures: true }),
  [
    body('email').isEmail(),
    body('password').isStrongPassword(),
    body('role').isIn(['Admin', 'Manager', 'User']),
  ],
  authController.register
);

router.post(
  '/login',
  authLimiter, // Apply stricter rate limiting to login
  endpointLogger('AUTH_LOGIN', { sensitive: true, trackFailures: true }),
  authController.login
);

export default router; 