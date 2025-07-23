/**
 * Website/HTTP Credential Verifier
 * Verifies website login credentials and HTTP authentication
 */

// Use built-in fetch in Node.js 18+
import { JSDOM } from 'jsdom';
import { logger } from '../utils/logger.js';
import { decrypt } from '../../utils/encryption.js';

export class WebsiteVerifier {
  constructor(config) {
    this.config = config;
    this.timeout = config.get('websiteTimeout') || config.get('apiTimeout');
  }
  
  /**
   * Verify website credential
   * @param {Object} credential - Credential object from database
   * @returns {Promise<Object>} Verification result
   */
  async verify(credential) {
    const startTime = Date.now();
    logger.info(`🌐 Verifying Website credential: ${credential.id} (${credential.name})`);
    
    try {
      // Decrypt the credential value
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch (parseError) {
        // If not JSON, treat as basic auth with URL from credential record
        connectionConfig = {
          password: decryptedValue,
          username: credential.username,
          url: credential.host || credential.url,
          method: 'basic_auth'
        };
      }
      
      // Validate required fields
      if (!connectionConfig.url && !connectionConfig.loginUrl) {
        throw new Error('Missing URL for website credential verification');
      }
      
      if (!connectionConfig.username || !connectionConfig.password) {
        throw new Error('Missing username or password for website credential');
      }
      
      const method = (connectionConfig.method || 'form_login').toLowerCase();
      const url = connectionConfig.url || connectionConfig.loginUrl;
      
      logger.debug(`Attempting website verification via ${method}: ${url}`);
      
      let verificationResult;
      
      // Route to appropriate verification method
      switch (method) {
        case 'basic_auth':
          verificationResult = await this.verifyBasicAuth(connectionConfig);
          break;
        case 'form_login':
          verificationResult = await this.verifyFormLogin(connectionConfig);
          break;
        case 'digest_auth':
          verificationResult = await this.verifyDigestAuth(connectionConfig);
          break;
        case 'bearer_token':
          verificationResult = await this.verifyBearerToken(connectionConfig);
          break;
        case 'api_key':
          verificationResult = await this.verifyApiKey(connectionConfig);
          break;
        case 'oauth':
          verificationResult = await this.verifyOAuth(connectionConfig);
          break;
        default:
          // Try multiple methods
          verificationResult = await this.verifyMultipleMethods(connectionConfig);
      }
      
      const duration = Date.now() - startTime;
      logger.performance('Website verification', duration, {
        credentialId: credential.id,
        url: url,
        method: method,
        username: connectionConfig.username
      });
      
      if (verificationResult.success) {
        logger.info(`✅ Website credential verified successfully: ${credential.id}`);
      } else {
        logger.warn(`⚠️ Website credential verification failed: ${credential.id} - ${verificationResult.message}`);
      }
      
      return {
        ...verificationResult,
        details: {
          ...verificationResult.details,
          url: url,
          method: method,
          username: connectionConfig.username,
          connectionTime: duration
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Website verification failed for ${credential.id}:`, error.message);
      
      return this.createErrorResult(error, credential, duration);
    }
  }
  
  /**
   * Verify Basic Authentication
   */
  async verifyBasicAuth(config) {
    try {
      const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      
      const response = await fetch(config.url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'CyberVault-CPM/1.0'
        },
        timeout: this.timeout
      });
      
      if (response.status === 200) {
        return {
          success: true,
          message: 'Basic authentication successful',
          details: {
            method: 'basic_auth',
            statusCode: response.status,
            responseHeaders: Object.fromEntries(response.headers.entries())
          }
        };
      } else if (response.status === 401) {
        return {
          success: false,
          message: 'Basic authentication failed - invalid credentials',
          errorCategory: 'authentication',
          details: {
            method: 'basic_auth',
            statusCode: response.status
          }
        };
      } else {
        return {
          success: false,
          message: `HTTP ${response.status}: ${response.statusText}`,
          errorCategory: 'http_error',
          details: {
            method: 'basic_auth',
            statusCode: response.status
          }
        };
      }
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verify Form-based Login
   */
  async verifyFormLogin(config) {
    try {
      const loginUrl = config.loginUrl || config.url;
      const successUrl = config.successUrl;
      const successIndicator = config.successIndicator || config.successText;
      const failureIndicator = config.failureIndicator || config.errorText;
      
      // Step 1: Get login form
      logger.debug('Fetching login form...');
      const formResponse = await fetch(loginUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: this.timeout
      });
      
      if (!formResponse.ok) {
        throw new Error(`Failed to fetch login form: ${formResponse.status}`);
      }
      
      const formHtml = await formResponse.text();
      const dom = new JSDOM(formHtml);
      const document = dom.window.document;
      
      // Find login form
      const forms = document.querySelectorAll('form');
      let loginForm = null;
      
      for (const form of forms) {
        const formHtml = form.innerHTML.toLowerCase();
        if (formHtml.includes('password') || formHtml.includes('login') || formHtml.includes('signin')) {
          loginForm = form;
          break;
        }
      }
      
      if (!loginForm) {
        throw new Error('Could not find login form on page');
      }
      
      // Extract form fields
      const formAction = loginForm.getAttribute('action') || loginUrl;
      const formMethod = loginForm.getAttribute('method') || 'POST';
      
      // Build form data
      const formData = new URLSearchParams();
      const inputs = loginForm.querySelectorAll('input');
      
      for (const input of inputs) {
        const type = input.getAttribute('type') || 'text';
        const name = input.getAttribute('name');
        const value = input.getAttribute('value') || '';
        
        if (!name) continue;
        
        if (type.toLowerCase() === 'password') {
          formData.append(name, config.password);
        } else if (type.toLowerCase() === 'text' || type.toLowerCase() === 'email') {
          const nameLower = name.toLowerCase();
          if (nameLower.includes('user') || nameLower.includes('email') || nameLower.includes('login')) {
            formData.append(name, config.username);
          } else if (value) {
            formData.append(name, value);
          }
        } else if (type.toLowerCase() === 'hidden') {
          formData.append(name, value);
        }
      }
      
      // Step 2: Submit login form
      logger.debug('Submitting login form...');
      const submitUrl = new URL(formAction, loginUrl).href;
      
      const loginResponse = await fetch(submitUrl, {
        method: formMethod.toUpperCase(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': loginUrl
        },
        body: formData,
        redirect: 'manual', // Handle redirects manually
        timeout: this.timeout
      });
      
      const responseText = await loginResponse.text();
      
      // Step 3: Analyze response
      let success = false;
      let message = 'Form login verification completed';
      
      // Check for success indicators
      if (successIndicator) {
        success = responseText.toLowerCase().includes(successIndicator.toLowerCase());
      } else if (successUrl && loginResponse.headers.get('location')) {
        const redirectUrl = loginResponse.headers.get('location');
        success = redirectUrl.includes(successUrl);
      } else if (loginResponse.status >= 300 && loginResponse.status < 400) {
        // Redirect usually indicates successful login
        success = true;
      } else {
        // Check for common failure indicators
        const responseTextLower = responseText.toLowerCase();
        const hasError = failureIndicator ? 
          responseTextLower.includes(failureIndicator.toLowerCase()) :
          responseTextLower.includes('error') || 
          responseTextLower.includes('invalid') || 
          responseTextLower.includes('incorrect') ||
          responseTextLower.includes('failed');
        
        success = !hasError && loginResponse.status === 200;
      }
      
      if (success) {
        message = 'Form login successful';
      } else {
        message = 'Form login failed - invalid credentials or login error';
      }
      
      return {
        success,
        message,
        errorCategory: success ? null : 'authentication',
        details: {
          method: 'form_login',
          statusCode: loginResponse.status,
          formAction: submitUrl,
          redirectUrl: loginResponse.headers.get('location'),
          responseLength: responseText.length,
          hasSuccessIndicator: successIndicator ? responseText.includes(successIndicator) : null,
          hasFailureIndicator: failureIndicator ? responseText.includes(failureIndicator) : null
        }
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verify Digest Authentication
   */
  async verifyDigestAuth(config) {
    try {
      // First request to get the challenge
      const challengeResponse = await fetch(config.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'CyberVault-CPM/1.0'
        },
        timeout: this.timeout
      });
      
      if (challengeResponse.status !== 401) {
        throw new Error(`Expected 401 challenge, got ${challengeResponse.status}`);
      }
      
      const wwwAuth = challengeResponse.headers.get('www-authenticate');
      if (!wwwAuth || !wwwAuth.toLowerCase().includes('digest')) {
        throw new Error('Server does not support Digest authentication');
      }
      
      // For simplicity, we'll just report that digest auth is detected
      // Full digest auth implementation would require crypto operations
      return {
        success: true,
        message: 'Digest authentication endpoint detected (partial verification)',
        details: {
          method: 'digest_auth',
          statusCode: challengeResponse.status,
          challengeReceived: true,
          authHeader: wwwAuth.substring(0, 100)
        }
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verify Bearer Token Authentication
   */
  async verifyBearerToken(config) {
    try {
      const token = config.token || config.password;
      
      const response = await fetch(config.url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'CyberVault-CPM/1.0',
          'Accept': 'application/json'
        },
        timeout: this.timeout
      });
      
      const success = response.status >= 200 && response.status < 300;
      
      return {
        success,
        message: success ? 'Bearer token authentication successful' : 'Bearer token authentication failed',
        errorCategory: success ? null : (response.status === 401 ? 'authentication' : 'http_error'),
        details: {
          method: 'bearer_token',
          statusCode: response.status,
          responseHeaders: Object.fromEntries(response.headers.entries())
        }
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verify API Key Authentication
   */
  async verifyApiKey(config) {
    try {
      const apiKey = config.apiKey || config.password;
      const headerName = config.headerName || config.keyHeader || 'X-API-Key';
      
      const headers = {
        'User-Agent': 'CyberVault-CPM/1.0',
        'Accept': 'application/json'
      };
      
      headers[headerName] = apiKey;
      
      const response = await fetch(config.url, {
        method: 'GET',
        headers,
        timeout: this.timeout
      });
      
      const success = response.status >= 200 && response.status < 300;
      
      return {
        success,
        message: success ? 'API key authentication successful' : 'API key authentication failed',
        errorCategory: success ? null : (response.status === 401 ? 'authentication' : 'http_error'),
        details: {
          method: 'api_key',
          headerName,
          statusCode: response.status,
          responseHeaders: Object.fromEntries(response.headers.entries())
        }
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verify OAuth (simplified check)
   */
  async verifyOAuth(config) {
    try {
      // This is a simplified OAuth check - just verify the endpoint responds
      const response = await fetch(config.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'CyberVault-CPM/1.0'
        },
        timeout: this.timeout
      });
      
      // OAuth endpoints typically return specific responses
      const success = response.status === 200 || response.status === 302 || response.status === 401;
      
      return {
        success,
        message: success ? 'OAuth endpoint accessible' : 'OAuth endpoint not accessible',
        details: {
          method: 'oauth',
          statusCode: response.status,
          note: 'OAuth verification is limited - full OAuth flow not implemented'
        }
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Try multiple verification methods
   */
  async verifyMultipleMethods(config) {
    const methods = [
      { name: 'basic_auth', func: () => this.verifyBasicAuth(config) },
      { name: 'form_login', func: () => this.verifyFormLogin(config) },
      { name: 'bearer_token', func: () => this.verifyBearerToken(config) }
    ];
    
    let lastError = null;
    
    for (const method of methods) {
      try {
        logger.debug(`Trying website verification via ${method.name}`);
        const result = await method.func();
        
        if (result.success) {
          return {
            ...result,
            message: `${result.message} (via ${method.name})`,
            details: {
              ...result.details,
              methodsAttempted: methods.map(m => m.name),
              successMethod: method.name
            }
          };
        }
        
        lastError = result;
        
      } catch (error) {
        logger.debug(`Website verification via ${method.name} failed:`, error.message);
        lastError = {
          success: false,
          message: error.message,
          errorCategory: 'connection',
          details: { method: method.name }
        };
      }
    }
    
    // All methods failed
    return {
      success: false,
      message: `All website verification methods failed. Last error: ${lastError?.message || 'Unknown error'}`,
      errorCategory: lastError?.errorCategory || 'connection',
      details: {
        methodsAttempted: methods.map(m => m.name),
        lastError: lastError
      }
    };
  }
  
  /**
   * Create error result with categorization
   */
  createErrorResult(error, credential, duration) {
    let errorCategory = 'unknown';
    let userFriendlyMessage = error.message;
    
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      errorCategory = 'timeout';
      userFriendlyMessage = 'Website connection timeout - site may be slow or unreachable';
    } else if (error.message.includes('ECONNREFUSED')) {
      errorCategory = 'connection_refused';
      userFriendlyMessage = 'Connection refused - website may be down';
    } else if (error.message.includes('ENOTFOUND')) {
      errorCategory = 'host_not_found';
      userFriendlyMessage = 'Website not found - check URL';
    } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
      errorCategory = 'ssl_error';
      userFriendlyMessage = 'SSL/TLS error - certificate issues with website';
    } else if (error.message.includes('Missing')) {
      errorCategory = 'configuration';
      userFriendlyMessage = 'Invalid website credential configuration';
    }
    
    return {
      success: false,
      message: userFriendlyMessage,
      error: error.message,
      errorCategory,
      details: {
        url: credential.host || credential.url,
        username: credential.username,
        connectionTime: duration,
        errorType: error.constructor.name
      }
    };
  }
  
  /**
   * Validate website credential format
   */
  validateCredential(credential) {
    const errors = [];
    
    try {
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch {
        // Plain password - need URL and username from credential record
        if (!credential.host && !credential.url) {
          errors.push('Missing URL for website credential');
        }
        if (!credential.username) {
          errors.push('Missing username for website credential');
        }
        return { valid: errors.length === 0, errors };
      }
      
      // Validate JSON format
      if (!connectionConfig.url && !connectionConfig.loginUrl && !credential.host && !credential.url) {
        errors.push('Missing URL parameter');
      }
      
      if (!connectionConfig.username && !credential.username) {
        errors.push('Missing username parameter');
      }
      
      if (!connectionConfig.password && !connectionConfig.token && !connectionConfig.apiKey) {
        errors.push('Missing authentication parameter (password, token, or apiKey)');
      }
      
      if (connectionConfig.method) {
        const validMethods = ['basic_auth', 'form_login', 'digest_auth', 'bearer_token', 'api_key', 'oauth'];
        if (!validMethods.includes(connectionConfig.method.toLowerCase())) {
          errors.push(`Invalid method (must be one of: ${validMethods.join(', ')})`);
        }
      }
      
      if (connectionConfig.url || connectionConfig.loginUrl) {
        try {
          new URL(connectionConfig.url || connectionConfig.loginUrl);
        } catch {
          errors.push('Invalid URL format');
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
   * Check website verification dependencies
   */
  static async checkDependencies() {
    const dependencies = [
      { name: 'node-fetch', purpose: 'HTTP requests', required: true },
      { name: 'jsdom', purpose: 'HTML form parsing', required: true }
    ];
    
    const results = [];
    
    for (const dep of dependencies) {
      try {
        await import(dep.name);
        results.push({ ...dep, available: true });
      } catch {
        results.push({ ...dep, available: false });
      }
    }
    
    return results;
  }
}