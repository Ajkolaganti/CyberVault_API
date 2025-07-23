/**
 * API Token Verifier
 * Verifies API tokens by making test requests
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { decrypt } from '../../utils/encryption.js';

export class APIVerifier {
  constructor(config) {
    this.config = config;
    this.timeout = config.get('apiTimeout');
    this.testEndpoint = config.get('testApiEndpoint');
    this.fallbackEndpoint = config.get('fallbackTestEndpoint');
  }
  
  /**
   * Verify API token by making test request
   * @param {Object} credential - Credential object from database
   * @returns {Promise<Object>} Verification result
   */
  async verify(credential) {
    const startTime = Date.now();
    logger.info(`🔑 Verifying API token: ${credential.id} (${credential.name})`);
    
    try {
      // Decrypt the credential value
      const decryptedValue = decrypt(credential.value);
      let tokenConfig;
      
      try {
        tokenConfig = JSON.parse(decryptedValue);
      } catch (parseError) {
        // If not JSON, treat as plain token
        tokenConfig = {
          token: decryptedValue,
          type: 'bearer' // default type
        };
      }
      
      // Validate token
      if (!tokenConfig.token) {
        throw new Error('Missing API token');
      }
      
      // Determine endpoint to test
      const endpoint = tokenConfig.endpoint || this.testEndpoint;
      
      // Prepare request headers
      const headers = {
        'User-Agent': 'CyberVault-CPM/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      
      // Add authorization header based on token type
      const tokenType = (tokenConfig.type || 'bearer').toLowerCase();
      switch (tokenType) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${tokenConfig.token}`;
          break;
        case 'api_key':
          if (tokenConfig.header) {
            headers[tokenConfig.header] = tokenConfig.token;
          } else {
            headers['X-API-Key'] = tokenConfig.token;
          }
          break;
        case 'basic':
          headers['Authorization'] = `Basic ${Buffer.from(tokenConfig.token).toString('base64')}`;
          break;
        default:
          headers['Authorization'] = tokenConfig.token;
      }
      
      logger.debug(`Making API test request to: ${endpoint}`);
      
      // Make test request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal,
        timeout: this.timeout
      });
      
      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { text: responseText.substring(0, 200) };
      }
      
      // Determine success based on status code and endpoint
      let success = false;
      let message = '';
      
      if (endpoint.includes('httpbin.org')) {
        // Special handling for httpbin test endpoints
        success = response.status >= 200 && response.status < 300;
        message = success ? 'Test API request successful' : `Test API request failed with status ${response.status}`;
      } else {
        // For real endpoints, consider various success scenarios
        if (response.status >= 200 && response.status < 300) {
          success = true;
          message = 'API token authentication successful';
        } else if (response.status === 401) {
          success = false;
          message = 'API token authentication failed - invalid or expired token';
        } else if (response.status === 403) {
          success = false;
          message = 'API token authentication failed - insufficient permissions';
        } else if (response.status === 429) {
          success = false;
          message = 'API rate limit exceeded - token may be valid but throttled';
        } else if (response.status >= 500) {
          success = false;
          message = `API server error (${response.status}) - unable to verify token`;
        } else {
          success = false;
          message = `API request failed with status ${response.status}`;
        }
      }
      
      logger.performance('API verification', duration, {
        credentialId: credential.id,
        endpoint: endpoint,
        statusCode: response.status,
        tokenType: tokenType
      });
      
      if (success) {
        logger.info(`✅ API token verified successfully: ${credential.id}`);
      } else {
        logger.warn(`⚠️ API token verification failed: ${credential.id} - ${message}`);
      }
      
      return {
        success,
        message,
        details: {
          endpoint: endpoint,
          tokenType: tokenType,
          statusCode: response.status,
          responseTime: duration,
          responseSize: responseText.length,
          hasValidResponse: !!responseData,
          testType: endpoint.includes('httpbin.org') ? 'test_endpoint' : 'real_endpoint'
        },
        responseData: success ? responseData : undefined
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ API verification failed for ${credential.id}:`, error.message);
      
      // Categorize error types
      let errorCategory = 'unknown';
      let userFriendlyMessage = error.message;
      
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        errorCategory = 'timeout';
        userFriendlyMessage = 'Request timeout - API endpoint may be slow or unreachable';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ENOENT')) {
        errorCategory = 'network';
        userFriendlyMessage = 'Network error - unable to reach API endpoint';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorCategory = 'connection_refused';
        userFriendlyMessage = 'Connection refused - API service may be down';
      } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
        errorCategory = 'ssl_error';
        userFriendlyMessage = 'SSL/TLS error - certificate issues with API endpoint';
      } else if (error.message.includes('token')) {
        errorCategory = 'token_format';
        userFriendlyMessage = 'Invalid token format';
      }
      
      return {
        success: false,
        message: userFriendlyMessage,
        error: error.message,
        errorCategory,
        details: {
          endpoint: this.testEndpoint,
          requestTime: duration,
          errorType: error.constructor.name
        }
      };
    }
  }
  
  /**
   * Validate API token credential format
   * @param {Object} credential - Credential to validate
   * @returns {Object} Validation result
   */
  validateCredential(credential) {
    const errors = [];
    
    try {
      const decryptedValue = decrypt(credential.value);
      let tokenConfig;
      
      try {
        tokenConfig = JSON.parse(decryptedValue);
      } catch {
        // Plain token - that's fine
        return { valid: true, errors: [] };
      }
      
      // Validate JSON format
      if (!tokenConfig.token) {
        errors.push('Missing token value');
      }
      
      if (tokenConfig.type && !['bearer', 'api_key', 'basic'].includes(tokenConfig.type.toLowerCase())) {
        errors.push('Invalid token type (must be: bearer, api_key, or basic)');
      }
      
      if (tokenConfig.endpoint) {
        try {
          new URL(tokenConfig.endpoint);
        } catch {
          errors.push('Invalid endpoint URL format');
        }
      }
      
    } catch (error) {
      errors.push(`Failed to decrypt or parse credential: ${error.message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Test multiple endpoints for a token
   * @param {Object} credential - Credential to test
   * @param {Array} endpoints - Array of endpoints to test
   * @returns {Promise<Array>} Array of test results
   */
  async testMultipleEndpoints(credential, endpoints) {
    const results = [];
    
    for (const endpoint of endpoints) {
      try {
        // Create temporary credential with specific endpoint
        const tempCredential = { ...credential };
        const decryptedValue = decrypt(credential.value);
        let tokenConfig;
        
        try {
          tokenConfig = JSON.parse(decryptedValue);
        } catch {
          tokenConfig = { token: decryptedValue };
        }
        
        tokenConfig.endpoint = endpoint;
        tempCredential.value = JSON.stringify(tokenConfig);
        
        const result = await this.verify(tempCredential);
        results.push({
          endpoint,
          ...result
        });
        
      } catch (error) {
        results.push({
          endpoint,
          success: false,
          message: error.message,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Generate test API token credential for development
   * @returns {Object} Test credential
   */
  static generateTestCredential() {
    return {
      id: 'test-api-' + Date.now(),
      user_id: 'test-user',
      type: 'api_token',
      name: 'Test API Token',
      value: JSON.stringify({
        token: 'test-bearer-token-' + Math.random().toString(36).substr(2, 9),
        type: 'bearer',
        endpoint: 'https://httpbin.org/bearer'
      }),
      status: 'pending',
      created_at: new Date().toISOString()
    };
  }
}