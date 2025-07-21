import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { authorizeRoles } from '../middlewares/rbac.js';
import * as auditService from '../services/auditService.js';

const router = Router();
router.use(authenticate, authorizeRoles('Admin', 'Manager'));

router.get('/', async (req, res, next) => {
  try {
    const logs = await auditService.listLogs({
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router; 