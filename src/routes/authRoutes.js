import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController.js';
import { endpointLogger } from '../middlewares/endpointLogger.js';

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
  endpointLogger('AUTH_LOGIN', { sensitive: true, trackFailures: true }),
  authController.login
);

export default router; 