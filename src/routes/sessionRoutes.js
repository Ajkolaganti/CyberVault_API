import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middlewares/auth.js';
import * as sessionController from '../controllers/sessionController.js';

const router = Router();

router.use(authenticate);

router.post('/', [body('target').notEmpty()], sessionController.start);
router.post('/:id/end', sessionController.end);
router.get('/', sessionController.list);
router.post('/:id/logs', [body('message').notEmpty()], sessionController.postLog);
router.get('/:id/logs', sessionController.getLogs);

export default router; 