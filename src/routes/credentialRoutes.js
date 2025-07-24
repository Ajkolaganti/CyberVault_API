import { Router } from 'express';
import { body } from 'express-validator';
import * as credentialController from '../controllers/credentialController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  [
    body('type').isIn(['password', 'ssh', 'api_token', 'certificate', 'database']),
    body('name').notEmpty(),
    body().custom(body => {
      if (!body.value && !body.password) {
        throw new Error('Either value or password field is required');
      }
      return true;
    }),
  ],
  credentialController.create
);

router.get('/', credentialController.list);
router.get('/:id', credentialController.getById);
router.get('/:id/history', credentialController.getHistory);
router.post('/:id/verify', credentialController.verifyCredential);
router.put('/:id', credentialController.update);
router.delete('/:id', credentialController.remove);

export default router; 