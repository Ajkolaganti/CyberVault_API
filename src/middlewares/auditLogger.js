import { logAction } from '../services/auditService.js';

export function auditLogger(req, res, next) {
  res.on('finish', () => {
    if (req.user) {
      logAction({
        userId: req.user.id,
        action: `${req.method} ${req.originalUrl}`,
        resource: req.originalUrl,
        metadata: { status: res.statusCode },
      }).catch(console.error);
    }
  });
  next();
} 