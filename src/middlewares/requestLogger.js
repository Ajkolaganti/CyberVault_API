import logger from '../utils/logger.js';

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const cloned = { ...body };
  // Remove potentially sensitive fields
  ['password', 'value', 'token'].forEach((k) => {
    if (k in cloned) cloned[k] = '[REDACTED]';
  });
  return cloned;
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl, query, params, body } = req;
  logger.info('Request received', {
    method,
    url: originalUrl,
    query,
    params,
    body: sanitizeBody(body),
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Response sent', {
      method,
      url: originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });
  next();
} 