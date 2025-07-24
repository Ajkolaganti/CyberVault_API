import logger, { logtail } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error(err);
  
  const status = err.status || 500;
  const response = {
    status: 'error',
    message: err.message || 'Internal Server Error',
  };

  // Include validation errors if present
  if (err.errors) {
    response.errors = err.errors;
  }

  // Expose stack trace in development for easier debugging
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  // Enhanced error logging to Logtail with context
  const errorLevel = status >= 500 ? 'error' : 'warn';
  const logData = {
    app_name: "CyberVault API",
    type: "error_event",
    error_message: err.message || 'Internal Server Error',
    error_status: status,
    error_stack: err.stack,
    endpoint: req.originalUrl || req.url,
    method: req.method,
    user_id: req.user?.id || 'anonymous',
    user_role: req.user?.role || 'none',
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    request_body: req.method !== 'GET' ? sanitizeRequestBody(req.body) : undefined,
    query_params: Object.keys(req.query).length > 0 ? req.query : undefined
  };

  if (errorLevel === 'error') {
    logtail.error("Application Error", logData);
  } else {
    logtail.warn("Client Error", logData);
  }

  res.status(status).json(response);
}

// Helper function to sanitize sensitive data from request body
function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = ['password', 'value', 'secret', 'token', 'key', 'credential'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
} 