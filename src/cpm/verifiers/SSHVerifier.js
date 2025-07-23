/**
 * SSH Credential Verifier
 * Verifies SSH credentials by attempting connection
 */

import { NodeSSH } from 'node-ssh';
import { logger } from '../utils/logger.js';
import { decrypt } from '../../utils/encryption.js';

export class SSHVerifier {
  constructor(config) {
    this.config = config;
    this.timeout = config.get('sshTimeout');
  }
  
  /**
   * Verify SSH credential by attempting connection
   * @param {Object} credential - Credential object from database
   * @returns {Promise<Object>} Verification result
   */
  async verify(credential) {
    const startTime = Date.now();
    logger.info(`🔑 Verifying SSH credential: ${credential.id} (${credential.name})`);
    
    let ssh = null;
    
    try {
      // Decrypt the credential value
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch (parseError) {
        // If not JSON, treat as plain password
        connectionConfig = {
          password: decryptedValue,
          host: credential.host,
          port: credential.port || 22,
          username: credential.username
        };
      }
      
      // Validate required fields
      if (!connectionConfig.host || !connectionConfig.username) {
        throw new Error('Missing required SSH connection parameters (host, username)');
      }
      
      // Set up connection parameters
      const sshConfig = {
        host: connectionConfig.host,
        port: connectionConfig.port || 22,
        username: connectionConfig.username,
        connectTimeout: this.timeout,
        readyTimeout: this.timeout
      };
      
      // Add authentication method
      if (connectionConfig.password) {
        sshConfig.password = connectionConfig.password;
      } else if (connectionConfig.privateKey) {
        sshConfig.privateKey = connectionConfig.privateKey;
        if (connectionConfig.passphrase) {
          sshConfig.passphrase = connectionConfig.passphrase;
        }
      } else {
        throw new Error('No authentication method provided (password or privateKey required)');
      }
      
      logger.debug(`Attempting SSH connection to ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`);
      
      // Create SSH connection
      ssh = new NodeSSH();
      
      // Attempt connection with timeout
      const connectionPromise = ssh.connect(sshConfig);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('SSH connection timeout')), this.timeout);
      });
      
      await Promise.race([connectionPromise, timeoutPromise]);
      
      // Test basic command execution
      const result = await ssh.execCommand('echo "CPM-Test-$(date)"', {
        execOptions: {
          timeout: 5000 // 5 second timeout for command
        }
      });
      
      if (result.code !== 0) {
        throw new Error(`SSH command execution failed: ${result.stderr}`);
      }
      
      const duration = Date.now() - startTime;
      logger.performance('SSH verification', duration, {
        credentialId: credential.id,
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username
      });
      
      logger.info(`✅ SSH credential verified successfully: ${credential.id}`);
      
      return {
        success: true,
        message: 'SSH connection successful',
        details: {
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          connectionTime: duration,
          testCommand: result.stdout.trim(),
          authenticationType: connectionConfig.password ? 'password' : 'privateKey'
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ SSH verification failed for ${credential.id}:`, error.message);
      
      // Categorize error types
      let errorCategory = 'unknown';
      let userFriendlyMessage = error.message;
      
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        errorCategory = 'timeout';
        userFriendlyMessage = 'Connection timeout - host may be unreachable';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorCategory = 'connection_refused';
        userFriendlyMessage = 'Connection refused - SSH service may not be running';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ENOENT')) {
        errorCategory = 'host_not_found';
        userFriendlyMessage = 'Host not found - check hostname/IP address';
      } else if (error.message.includes('Authentication failed') || error.message.includes('auth')) {
        errorCategory = 'authentication';
        userFriendlyMessage = 'Authentication failed - check username/password/key';
      } else if (error.message.includes('Permission denied')) {
        errorCategory = 'permission_denied';
        userFriendlyMessage = 'Permission denied - check user permissions';
      } else if (error.message.includes('key')) {
        errorCategory = 'key_error';
        userFriendlyMessage = 'SSH key error - check private key format';
      }
      
      return {
        success: false,
        message: userFriendlyMessage,
        error: error.message,
        errorCategory,
        details: {
          host: credential.host,
          port: credential.port || 22,
          username: credential.username,
          connectionTime: duration,
          errorType: error.constructor.name
        }
      };
      
    } finally {
      // Clean up SSH connection
      if (ssh && ssh.connection) {
        try {
          ssh.dispose();
          logger.debug(`SSH connection disposed for ${credential.id}`);
        } catch (disposeError) {
          logger.warn(`Failed to dispose SSH connection: ${disposeError.message}`);
        }
      }
    }
  }
  
  /**
   * Validate SSH credential format
   * @param {Object} credential - Credential to validate
   * @returns {Object} Validation result
   */
  validateCredential(credential) {
    const errors = [];
    
    try {
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch {
        // Treat as plain password - need host and username from credential record
        if (!credential.host || !credential.username) {
          errors.push('Missing host or username for SSH credential');
        }
        return { valid: errors.length === 0, errors };
      }
      
      // Validate JSON format
      if (!connectionConfig.host && !credential.host) {
        errors.push('Missing host parameter');
      }
      
      if (!connectionConfig.username && !credential.username) {
        errors.push('Missing username parameter');
      }
      
      if (!connectionConfig.password && !connectionConfig.privateKey) {
        errors.push('Missing authentication method (password or privateKey)');
      }
      
      if (connectionConfig.port && (isNaN(connectionConfig.port) || connectionConfig.port < 1 || connectionConfig.port > 65535)) {
        errors.push('Invalid port number');
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
   * Generate test SSH credential for development
   * @returns {Object} Test credential
   */
  static generateTestCredential() {
    return {
      id: 'test-ssh-' + Date.now(),
      user_id: 'test-user',
      type: 'ssh',
      name: 'Test SSH Connection',
      host: 'test.cybervault.local',
      port: 22,
      username: 'testuser',
      value: JSON.stringify({
        host: 'test.cybervault.local',
        port: 22,
        username: 'testuser',
        password: 'testpassword'
      }),
      status: 'pending',
      created_at: new Date().toISOString()
    };
  }
}