import { logtail } from '../utils/logger.js';

// Middleware for enhanced API monitoring
export function apiMonitoring(req, res, next) {
  const startTime = Date.now();
  
  // Capture original res.json to log response data
  const originalJson = res.json;
  const originalStatus = res.status;
  
  let responseBody = null;
  let statusCode = 200;
  
  // Override res.status to capture status code
  res.status = function(code) {
    statusCode = code;
    return originalStatus.call(this, code);
  };
  
  // Override res.json to capture response body
  res.json = function(body) {
    responseBody = body;
    return originalJson.call(this, body);
  };
  
  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endpoint = req.originalUrl || req.url;
    
    // Determine if this is a sensitive endpoint
    const sensitiveEndpoints = ['/auth/login', '/auth/register', '/credentials'];
    const isSensitive = sensitiveEndpoints.some(path => endpoint.includes(path));
    
    // Log comprehensive API monitoring data
    logtail.info("API Endpoint Hit", {
      app_name: "CyberVault API",
      type: "api_monitoring",
      endpoint: endpoint,
      method: req.method,
      status_code: statusCode,
      response_time_ms: duration,
      success: statusCode < 400,
      user_id: req.user?.id || 'anonymous',
      user_role: req.user?.role || 'none',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      content_length: res.get('Content-Length') || 0,
      request_size: req.headers['content-length'] || 0,
      timestamp: new Date().toISOString(),
      
      // API-specific data
      has_auth: !!req.headers.authorization,
      query_params_count: Object.keys(req.query).length,
      body_fields_count: req.body && typeof req.body === 'object' ? Object.keys(req.body).length : 0,
      
      // Response data (sanitized for sensitive endpoints)
      response_success: responseBody?.success,
      response_data_count: responseBody?.data?.length || responseBody?.count || 0,
      response_error: statusCode >= 400 ? responseBody?.message : undefined,
      
      // Performance metrics
      slow_request: duration > 1000,
      very_slow_request: duration > 5000,
      
      // Security indicators
      potential_attack: statusCode === 401 || statusCode === 403,
      server_error: statusCode >= 500,
      client_error: statusCode >= 400 && statusCode < 500
    });
    
    // Log slow requests separately
    if (duration > 2000) {
      logtail.warn("Slow API Request", {
        app_name: "CyberVault API",
        type: "performance_alert",
        endpoint: endpoint,
        method: req.method,
        response_time_ms: duration,
        user_id: req.user?.id || 'anonymous',
        timestamp: new Date().toISOString()
      });
    }
    
    // Log security events
    if (statusCode === 401 || statusCode === 403) {
      logtail.warn("Authentication/Authorization Failure", {
        app_name: "CyberVault API",
        type: "security_event",
        endpoint: endpoint,
        method: req.method,
        status_code: statusCode,
        user_id: req.user?.id || 'anonymous',
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      });
    }
  });
  
  next();
}

// Middleware for specific endpoint categories
export function criticalEndpointMonitoring(req, res, next) {
  const endpoint = req.originalUrl || req.url;
  
  // Track access to critical endpoints
  const criticalEndpoints = [
    '/credentials',
    '/jit',
    '/accounts',
    '/auth',
    '/validation'
  ];
  
  const isCritical = criticalEndpoints.some(path => endpoint.includes(path));
  
  if (isCritical) {
    logtail.info("Critical Endpoint Access", {
      app_name: "CyberVault API",
      type: "security_monitoring",
      action: "critical_endpoint_access",
      endpoint: endpoint,
      method: req.method,
      user_id: req.user?.id || 'anonymous',
      user_role: req.user?.role || 'none',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });
  }
  
  next();
}