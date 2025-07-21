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
  
  // Extract detailed request origin and metadata
  const requestMetadata = {
    method,
    url: originalUrl,
    query,
    params,
    body: sanitizeBody(body),
    // Origin tracking
    origin: req.get('Origin') || 'unknown',
    referer: req.get('Referer') || 'none',
    userAgent: req.get('User-Agent') || 'unknown',
    // Network information
    clientIP: req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown',
    forwardedFor: req.get('X-Forwarded-For') || 'none',
    realIP: req.get('X-Real-IP') || 'none',
    // Request headers for debugging
    host: req.get('Host') || 'unknown',
    acceptLanguage: req.get('Accept-Language') || 'none',
    authorization: req.get('Authorization') ? '[PRESENT]' : '[NONE]',
    // Timing
    timestamp: new Date().toISOString(),
    requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };

  // Log detailed request information
  logger.info('Request received', requestMetadata);
  
  // Log origin-specific information for CORS debugging
  if (requestMetadata.origin !== 'unknown') {
    logger.info('Request origin details', {
      requestId: requestMetadata.requestId,
      origin: requestMetadata.origin,
      isAllowedOrigin: checkIfOriginAllowed(requestMetadata.origin),
      method: requestMetadata.method,
      url: requestMetadata.url
    });
  }

  // Attach request ID for correlation
  req.requestId = requestMetadata.requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const responseMetadata = {
      requestId: requestMetadata.requestId,
      method,
      url: originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
      origin: requestMetadata.origin,
      clientIP: requestMetadata.clientIP,
      timestamp: new Date().toISOString()
    };
    
    // Log response with correlation
    logger.info('Response sent', responseMetadata);
    
    // Log potential CORS issues
    if (res.statusCode >= 400 && requestMetadata.origin !== 'unknown') {
      logger.warn('Potential CORS issue detected', {
        requestId: requestMetadata.requestId,
        statusCode: res.statusCode,
        origin: requestMetadata.origin,
        method: requestMetadata.method,
        url: requestMetadata.url
      });
    }
  });
  
  next();
}

// Helper function to check if origin is allowed
function checkIfOriginAllowed(origin) {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'https://cyber-vault-ui.vercel.app',
    'http://localhost:3001',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
  ];
  
  return allowedOrigins.includes(origin);
} 