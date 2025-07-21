import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController.js';

const router = Router();

router.post(
  '/register',
  [
    body('email').isEmail(),
    body('password').isStrongPassword(),
    body('role').isIn(['Admin', 'Manager', 'User']),
  ],
  authController.register
);

router.post('/login', authController.login);

export default router; 