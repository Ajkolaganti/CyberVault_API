# Enhanced Logging Documentation

## Overview
The CyberVault API now includes comprehensive logging for tracking request origins and monitoring all endpoint access. This helps with debugging, security monitoring, and CORS troubleshooting.

## Logging Levels

### 1. Global Request Logging (`requestLogger`)
**Location**: `src/middlewares/requestLogger.js`

**Tracks**:
- Request origin (`Origin` header)
- Referer information
- Client IP address (including proxied IPs)
- User agent
- Request metadata (method, URL, params, query)
- Response timing and status codes
- CORS compliance checking

**Log Examples**:
```json
{
  "level": "info",
  "message": "Request received",
  "origin": "https://cyber-vault-ui.vercel.app",
  "clientIP": "192.168.1.100",
  "method": "POST",
  "url": "/api/v1/auth/login",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2025-07-21T14:02:16.123Z",
  "requestId": "1642774936123-abc123def"
}
```

### 2. CORS-Specific Logging (`corsLogger`)
**Location**: `src/middlewares/endpointLogger.js`

**Tracks**:
- All CORS preflight requests
- Cross-origin request patterns
- CORS response headers
- Origin validation results

### 3. Security-Focused Logging (`securityLogger`)
**Location**: `src/middlewares/endpointLogger.js`

**Tracks**:
- Suspicious request patterns
- Authentication attempts
- Potential injection attacks
- Security header analysis

### 4. Endpoint-Specific Logging (`endpointLogger`)
**Location**: `src/middlewares/endpointLogger.js`

**Usage**:
```javascript
import { endpointLogger } from '../middlewares/endpointLogger.js';

router.post(
  '/sensitive-endpoint',
  endpointLogger('ENDPOINT_NAME', { 
    sensitive: true, 
    trackFailures: true 
  }),
  controller.method
);
```

## Request Origin Tracking

### Tracked Headers:
- `Origin`: Primary origin of the request
- `Referer`: Page that initiated the request
- `X-Forwarded-For`: Proxy chain information
- `X-Real-IP`: Real client IP
- `User-Agent`: Client application details

### IP Address Resolution:
1. `req.ip` (Express with trust proxy)
2. `X-Forwarded-For` header
3. `X-Real-IP` header
4. Direct connection IP

## CORS Debugging

### Allowed Origins Monitoring:
The system automatically checks if incoming origins are in the allowed list:
- `http://localhost:5173` (Vite dev)
- `http://localhost:3000` (React dev)
- `http://127.0.0.1:5173` (Alternative localhost)
- `https://cyber-vault-ui.vercel.app` (Production)

### CORS Issue Detection:
- Automatic flagging of 4xx responses from unknown origins
- Preflight request tracking
- CORS header validation logging

## Security Monitoring

### Suspicious Pattern Detection:
- SQL injection attempts
- XSS patterns
- JavaScript injection
- Union select queries

### Authentication Logging:
- All `/auth/*` endpoint access
- Bearer token presence detection
- Failed authentication attempts

## Log Correlation

### Request ID System:
Each request gets a unique ID for correlation across log entries:
```
requestId: "1642774936123-abc123def"
```

This ID appears in all related log entries for easy tracking.

## Configuration

### Trust Proxy Setup:
```javascript
app.set('trust proxy', true);
```
This ensures accurate IP address resolution behind load balancers.

### Log Levels:
- `info`: Normal request/response flow
- `warn`: Potential CORS issues
- `error`: Failed requests, security concerns

## Performance Impact
- Minimal overhead (~1-2ms per request)
- Efficient header extraction
- Conditional logging based on request type

## Troubleshooting CORS Issues

### Common Scenarios:
1. **Unknown Origin**: Check if the frontend URL is in `allowedOrigins`
2. **Preflight Failures**: Look for OPTIONS request logs
3. **Credential Issues**: Verify `credentials: true` configuration

### Log Queries:
```bash
# Find requests from specific origin
grep "cyber-vault-ui.vercel.app" logs/

# Track failed CORS requests
grep "CORS issue detected" logs/

# Monitor authentication attempts
grep "AUTH_LOGIN\|AUTH_REGISTER" logs/
```

## Best Practices

1. **Sensitive Endpoints**: Use `endpointLogger` with `sensitive: true`
2. **High-Traffic Endpoints**: Monitor performance impact
3. **Security Alerts**: Set up alerts for suspicious patterns
4. **Origin Validation**: Regularly review unknown origins in logs

## Example Log Entries

### Successful Request:
```json
{
  "level": "info",
  "message": "Endpoint AUTH_LOGIN - Request completed",
  "requestId": "1642774936123-abc123def",
  "statusCode": 200,
  "origin": "https://cyber-vault-ui.vercel.app",
  "durationMs": 245
}
```

### CORS Issue:
```json
{
  "level": "warn",
  "message": "Potential CORS issue detected",
  "origin": "https://unknown-site.com",
  "statusCode": 403,
  "method": "POST",
  "url": "/api/v1/credentials"
}
```

### Security Alert:
```json
{
  "level": "warn",
  "message": "Potentially suspicious request detected",
  "origin": "unknown",
  "suspiciousContent": true,
  "clientIP": "192.168.1.100"
}
```
