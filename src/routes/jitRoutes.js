import { Router } from 'express';
import { body } from 'express-validator';
import * as jitController from '../controllers/jitController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  [body('resource').notEmpty(), body('durationMinutes').optional().isInt({ min: 1 })],
  jitController.request
);

router.get('/', jitController.list);
router.post('/:id/revoke', jitController.revoke);

export default router; 