import logger from '../utils/logger.js';

/**
 * Enhanced endpoint-specific logging middleware
 * Provides detailed tracking for specific endpoints with additional context
 */
export function endpointLogger(endpointName, options = {}) {
  return (req, res, next) => {
    const start = Date.now();
    const requestId = req.requestId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const endpointMetadata = {
      endpointName,
      requestId,
      method: req.method,
      url: req.originalUrl,
      // Enhanced origin tracking
      origin: req.get('Origin') || 'unknown',
      referer: req.get('Referer') || 'none',
      userAgent: req.get('User-Agent') || 'unknown',
      // Network details
      clientIP: req.ip || req.connection.remoteAddress || 'unknown',
      forwardedFor: req.get('X-Forwarded-For') || 'none',
      realIP: req.get('X-Real-IP') || 'none',
      // Security headers
      authorization: req.get('Authorization') ? '[PRESENT]' : '[NONE]',
      contentType: req.get('Content-Type') || 'none',
      // Request specifics
      params: req.params,
      query: req.query,
      bodySize: req.get('Content-Length') || 0,
      // Timing
      timestamp: new Date().toISOString(),
      // Additional options
      ...options
    };

    // Log endpoint entry
    logger.info(`Endpoint ${endpointName} - Request started`, endpointMetadata);

    // Override res.json to log response data
    const originalJson = res.json;
    res.json = function(data) {
      const duration = Date.now() - start;
      
      // Log successful completion
      logger.info(`Endpoint ${endpointName} - Request completed`, {
        requestId,
        endpointName,
        statusCode: res.statusCode,
        durationMs: duration,
        origin: endpointMetadata.origin,
        clientIP: endpointMetadata.clientIP,
        responseSize: JSON.stringify(data).length,
        timestamp: new Date().toISOString()
      });

      return originalJson.call(this, data);
    };

    // Log errors and non-200 responses
    res.on('finish', () => {
      const duration = Date.now() - start;
      
      if (res.statusCode >= 400) {
        logger.error(`Endpoint ${endpointName} - Request failed`, {
          requestId,
          endpointName,
          statusCode: res.statusCode,
          durationMs: duration,
          origin: endpointMetadata.origin,
          clientIP: endpointMetadata.clientIP,
          method: req.method,
          url: req.originalUrl,
          timestamp: new Date().toISOString()
        });
      }
    });

    next();
  };
}

/**
 * CORS-specific logging middleware
 * Tracks CORS-related requests and potential issues
 */
export function corsLogger(req, res, next) {
  const origin = req.get('Origin');
  const method = req.method;
  
  if (origin) {
    const corsMetadata = {
      type: 'CORS_REQUEST',
      origin,
      method,
      url: req.originalUrl,
      isPreflight: method === 'OPTIONS',
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      clientIP: req.ip || 'unknown'
    };

    if (method === 'OPTIONS') {
      logger.info('CORS Preflight request', corsMetadata);
    } else {
      logger.info('CORS Request', corsMetadata);
    }

    // Log CORS response headers
    res.on('finish', () => {
      logger.info('CORS Response headers', {
        requestId: req.requestId,
        origin,
        statusCode: res.statusCode,
        accessControlAllowOrigin: res.get('Access-Control-Allow-Origin') || 'none',
        accessControlAllowMethods: res.get('Access-Control-Allow-Methods') || 'none',
        accessControlAllowHeaders: res.get('Access-Control-Allow-Headers') || 'none',
        timestamp: new Date().toISOString()
      });
    });
  }

  next();
}

/**
 * Security-focused logging middleware
 * Tracks potential security issues and suspicious requests
 */
export function securityLogger(req, res, next) {
  const securityMetadata = {
    type: 'SECURITY_CHECK',
    requestId: req.requestId,
    origin: req.get('Origin') || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
    clientIP: req.ip || 'unknown',
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString()
  };

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /sql.*injection/i,
    /<script/i,
    /javascript:/i,
    /eval\(/i,
    /union.*select/i
  ];

  const urlParams = JSON.stringify({ ...req.query, ...req.params, ...req.body });
  const hasSuspiciousContent = suspiciousPatterns.some(pattern => pattern.test(urlParams));

  if (hasSuspiciousContent) {
    logger.warn('Potentially suspicious request detected', {
      ...securityMetadata,
      suspiciousContent: true,
      patterns: 'detected'
    });
  }

  // Log authentication attempts
  if (req.originalUrl.includes('/auth/') || req.get('Authorization')) {
    logger.info('Authentication request', {
      ...securityMetadata,
      authEndpoint: req.originalUrl.includes('/auth/'),
      hasAuthHeader: !!req.get('Authorization')
    });
  }

  next();
}
