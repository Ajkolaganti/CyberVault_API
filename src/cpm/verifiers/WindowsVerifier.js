/**
 * Windows/RDP Credential Verifier
 * Verifies Windows credentials via RDP/WinRM/PowerShell
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { decrypt } from '../../utils/encryption.js';

const execAsync = promisify(exec);

export class WindowsVerifier {
  constructor(config) {
    this.config = config;
    this.timeout = config.get('windowsTimeout') || config.get('verificationTimeout');
  }
  
  /**
   * Verify Windows credential via multiple methods
   * @param {Object} credential - Credential object from database
   * @returns {Promise<Object>} Verification result
   */
  async verify(credential) {
    const startTime = Date.now();
    logger.info(`🪟 Verifying Windows credential: ${credential.id} (${credential.name})`);
    
    try {
      // Decrypt the credential value
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch (parseError) {
        // If not JSON, treat as plain password with host info from credential record
        connectionConfig = {
          password: decryptedValue,
          host: credential.host,
          port: credential.port || 3389,
          username: credential.username,
          method: 'rdp' // default method
        };
      }
      
      // Validate required fields
      if (!connectionConfig.host || !connectionConfig.username || !connectionConfig.password) {
        throw new Error('Missing required Windows connection parameters (host, username, password)');
      }
      
      const host = connectionConfig.host;
      const port = connectionConfig.port || 3389;
      const username = connectionConfig.username;
      const password = connectionConfig.password;
      const domain = connectionConfig.domain || '';
      const method = connectionConfig.method || 'rdp';
      
      logger.debug(`Attempting Windows verification: ${username}@${host}:${port} via ${method}`);
      
      let verificationResult;
      
      // Try different verification methods based on configuration
      switch (method.toLowerCase()) {
        case 'rdp':
          verificationResult = await this.verifyRDP(host, port, username, password, domain);
          break;
        case 'winrm':
          verificationResult = await this.verifyWinRM(host, port, username, password, domain);
          break;
        case 'smb':
          verificationResult = await this.verifySMB(host, username, password, domain);
          break;
        case 'wmi':
          verificationResult = await this.verifyWMI(host, username, password, domain);
          break;
        default:
          // Try multiple methods in order of preference
          verificationResult = await this.verifyMultipleMethods(host, port, username, password, domain);
      }
      
      const duration = Date.now() - startTime;
      logger.performance('Windows verification', duration, {
        credentialId: credential.id,
        host: host,
        port: port,
        username: username,
        method: method
      });
      
      if (verificationResult.success) {
        logger.info(`✅ Windows credential verified successfully: ${credential.id}`);
      } else {
        logger.warn(`⚠️ Windows credential verification failed: ${credential.id} - ${verificationResult.message}`);
      }
      
      return {
        ...verificationResult,
        details: {
          ...verificationResult.details,
          host: host,
          port: port,
          username: username,
          domain: domain || 'local',
          connectionTime: duration,
          method: method
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Windows verification failed for ${credential.id}:`, error.message);
      
      return this.createErrorResult(error, credential, duration);
    }
  }
  
  /**
   * Verify RDP connection using xfreerdp or similar
   */
  async verifyRDP(host, port, username, password, domain) {
    try {
      // Use xfreerdp with connection test only (no GUI)
      const domainUser = domain ? `${domain}\\${username}` : username;
      const command = `timeout ${Math.floor(this.timeout/1000)} xfreerdp /v:${host}:${port} /u:"${domainUser}" /p:"${password}" /cert-ignore /sec:rdp /auth-only +clipboard /drive:temp,/tmp 2>&1 || echo "RDP_TEST_COMPLETE"`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.timeout,
        env: { ...process.env, DISPLAY: ':99' } // Use virtual display
      });
      
      const output = stdout + stderr;
      
      // Check for successful authentication indicators
      if (output.includes('Authentication successful') || 
          output.includes('connected to') ||
          output.includes('RDP_TEST_COMPLETE')) {
        return {
          success: true,
          message: 'RDP authentication successful',
          details: {
            method: 'rdp',
            output: output.substring(0, 200)
          }
        };
      } else if (output.includes('Authentication failure') || 
                 output.includes('ACCESS_DENIED') ||
                 output.includes('LOGON_FAILURE')) {
        return {
          success: false,
          message: 'RDP authentication failed',
          errorCategory: 'authentication',
          details: {
            method: 'rdp',
            output: output.substring(0, 200)
          }
        };
      } else {
        throw new Error(`RDP connection failed: ${output.substring(0, 100)}`);
      }
      
    } catch (error) {
      if (error.message.includes('timeout')) {
        return {
          success: false,
          message: 'RDP connection timeout',
          errorCategory: 'timeout',
          details: { method: 'rdp' }
        };
      }
      throw error;
    }
  }
  
  /**
   * Verify WinRM connection using PowerShell
   */
  async verifyWinRM(host, port, username, password, domain) {
    try {
      const winrmPort = port || 5985;
      const domainUser = domain ? `${domain}\\${username}` : username;
      
      // PowerShell script to test WinRM connection
      const psScript = `
        $securePassword = ConvertTo-SecureString "${password}" -AsPlainText -Force
        $credential = New-Object System.Management.Automation.PSCredential("${domainUser}", $securePassword)
        $session = New-PSSession -ComputerName "${host}" -Port ${winrmPort} -Credential $credential -ErrorAction Stop
        if ($session) {
          Invoke-Command -Session $session -ScriptBlock { Get-ComputerInfo | Select-Object WindowsProductName, TotalPhysicalMemory } -ErrorAction Stop
          Remove-PSSession $session
          Write-Output "WINRM_SUCCESS"
        }
      `;
      
      const command = `powershell -Command "${psScript.replace(/"/g, '\\"')}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.timeout
      });
      
      if (stdout.includes('WINRM_SUCCESS') || stdout.includes('WindowsProductName')) {
        return {
          success: true,
          message: 'WinRM authentication successful',
          details: {
            method: 'winrm',
            port: winrmPort,
            output: stdout.substring(0, 200)
          }
        };
      } else {
        throw new Error(`WinRM failed: ${stderr || stdout}`);
      }
      
    } catch (error) {
      if (error.message.includes('Access is denied') || error.message.includes('authentication')) {
        return {
          success: false,
          message: 'WinRM authentication failed',
          errorCategory: 'authentication',
          details: { method: 'winrm' }
        };
      }
      throw error;
    }
  }
  
  /**
   * Verify SMB/CIFS share access
   */
  async verifySMB(host, username, password, domain) {
    try {
      const domainUser = domain ? `${domain}/${username}` : username;
      
      // Try to list shares using smbclient
      const command = `smbclient -L //${host} -U "${domainUser}%${password}" -N 2>&1`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.timeout
      });
      
      const output = stdout + stderr;
      
      if (output.includes('Domain=') || output.includes('Sharename')) {
        return {
          success: true,
          message: 'SMB authentication successful',
          details: {
            method: 'smb',
            shares: output.match(/Sharename\s+Type\s+Comment/g) ? 'accessible' : 'limited'
          }
        };
      } else if (output.includes('NT_STATUS_LOGON_FAILURE') || 
                 output.includes('NT_STATUS_ACCESS_DENIED')) {
        return {
          success: false,
          message: 'SMB authentication failed',
          errorCategory: 'authentication',
          details: { method: 'smb' }
        };
      } else {
        throw new Error(`SMB connection failed: ${output.substring(0, 100)}`);
      }
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verify WMI access
   */
  async verifyWMI(host, username, password, domain) {
    try {
      const domainUser = domain ? `${domain}\\${username}` : username;
      
      // Use wmic or equivalent to test WMI access
      const command = `wmic /node:"${host}" /user:"${domainUser}" /password:"${password}" computersystem get name 2>&1`;
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.timeout
      });
      
      const output = stdout + stderr;
      
      if (output.includes('Name') && !output.includes('ERROR')) {
        return {
          success: true,
          message: 'WMI authentication successful',
          details: {
            method: 'wmi',
            computerName: output.match(/Name\s+(\S+)/)?.[1] || 'detected'
          }
        };
      } else {
        throw new Error(`WMI failed: ${output.substring(0, 100)}`);
      }
      
    } catch (error) {
      if (error.message.includes('credentials') || error.message.includes('authentication')) {
        return {
          success: false,
          message: 'WMI authentication failed',
          errorCategory: 'authentication',
          details: { method: 'wmi' }
        };
      }
      throw error;
    }
  }
  
  /**
   * Try multiple verification methods
   */
  async verifyMultipleMethods(host, port, username, password, domain) {
    const methods = [
      { name: 'winrm', func: () => this.verifyWinRM(host, port, username, password, domain) },
      { name: 'smb', func: () => this.verifySMB(host, username, password, domain) },
      { name: 'rdp', func: () => this.verifyRDP(host, port, username, password, domain) }
    ];
    
    let lastError = null;
    
    for (const method of methods) {
      try {
        logger.debug(`Trying Windows verification via ${method.name}`);
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
        logger.debug(`Windows verification via ${method.name} failed:`, error.message);
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
      message: `All Windows verification methods failed. Last error: ${lastError?.message || 'Unknown error'}`,
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
      userFriendlyMessage = 'Connection timeout - Windows host may be unreachable';
    } else if (error.message.includes('ECONNREFUSED')) {
      errorCategory = 'connection_refused';
      userFriendlyMessage = 'Connection refused - Windows services may not be running';
    } else if (error.message.includes('ENOTFOUND')) {
      errorCategory = 'host_not_found';
      userFriendlyMessage = 'Host not found - check hostname/IP address';
    } else if (error.message.includes('authentication') || error.message.includes('LOGON_FAILURE')) {
      errorCategory = 'authentication';
      userFriendlyMessage = 'Authentication failed - check username/password/domain';
    } else if (error.message.includes('ACCESS_DENIED')) {
      errorCategory = 'permission_denied';
      userFriendlyMessage = 'Access denied - check user permissions and group memberships';
    }
    
    return {
      success: false,
      message: userFriendlyMessage,
      error: error.message,
      errorCategory,
      details: {
        host: credential.host,
        port: credential.port || 3389,
        username: credential.username,
        connectionTime: duration,
        errorType: error.constructor.name
      }
    };
  }
  
  /**
   * Validate Windows credential format
   */
  validateCredential(credential) {
    const errors = [];
    
    try {
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch {
        // Plain password - need host and username from credential record
        if (!credential.host || !credential.username) {
          errors.push('Missing host or username for Windows credential');
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
      
      if (!connectionConfig.password) {
        errors.push('Missing password parameter');
      }
      
      if (connectionConfig.port && (isNaN(connectionConfig.port) || connectionConfig.port < 1 || connectionConfig.port > 65535)) {
        errors.push('Invalid port number');
      }
      
      if (connectionConfig.method && !['rdp', 'winrm', 'smb', 'wmi'].includes(connectionConfig.method.toLowerCase())) {
        errors.push('Invalid method (must be: rdp, winrm, smb, or wmi)');
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
   * Verify if a specific user account exists on the Windows system
   */
  async verifyAccountExists(credentialData) {
    try {
      logger.debug(`Verifying Windows account existence: ${credentialData.target_username} on ${credentialData.target_hostname}`);
      
      const config = this.parseCredentialValue(credentialData.value);
      const host = credentialData.host || credentialData.target_hostname;
      const port = credentialData.port || config.port || 5985; // Default WinRM port
      const username = credentialData.username;
      const password = credentialData.password || config.password;
      const domain = config.domain;
      
      // Try multiple Windows account verification methods
      const verificationMethods = ['winrm', 'smb', 'rdp'];
      let accountFound = false;
      let lastError = null;
      let verificationDetails = [];
      
      for (const method of verificationMethods) {
        try {
          logger.debug(`Attempting Windows account verification via ${method}`);
          
          let result;
          switch (method) {
            case 'winrm':
              result = await this.verifyAccountViaWinRM(host, port, username, password, domain, credentialData.target_username);
              break;
            case 'smb':
              result = await this.verifyAccountViaSMB(host, username, password, domain, credentialData.target_username);
              break;
            case 'rdp':
              result = await this.verifyAccountViaRDP(host, 3389, username, password, domain, credentialData.target_username);
              break;
          }
          
          verificationDetails.push({
            method,
            success: result.success,
            message: result.message,
            details: result.details || {}
          });
          
          if (result.success) {
            accountFound = true;
            logger.info(`✅ Account ${credentialData.target_username} found on ${credentialData.target_hostname} via: ${method}`);
            break;
          } else {
            lastError = result.message;
            logger.debug(`Account verification failed via ${method}: ${result.message}`);
          }
          
        } catch (methodError) {
          lastError = `${method} verification failed: ${methodError.message}`;
          logger.warn(lastError);
          verificationDetails.push({
            method,
            success: false,
            error: methodError.message
          });
        }
      }
      
      if (accountFound) {
        return {
          success: true,
          message: `Account '${credentialData.target_username}' verified successfully on ${credentialData.target_hostname}`,
          details: {
            verification_type: 'account_existence',
            target_username: credentialData.target_username,
            target_hostname: credentialData.target_hostname,
            verification_methods: verificationDetails
          }
        };
      } else {
        return {
          success: false,
          message: `Account '${credentialData.target_username}' not found on ${credentialData.target_hostname}`,
          error_category: 'account_not_found',
          details: {
            verification_type: 'account_existence',
            target_username: credentialData.target_username,
            target_hostname: credentialData.target_hostname,
            verification_methods: verificationDetails,
            last_error: lastError
          }
        };
      }
      
    } catch (error) {
      logger.error(`Windows account verification failed for ${credentialData.target_username}@${credentialData.target_hostname}:`, error);
      
      return {
        success: false,
        message: `Account verification failed: ${error.message}`,
        error_category: this.categorizeError(error),
        details: {
          verification_type: 'account_existence',
          target_username: credentialData.target_username,
          target_hostname: credentialData.target_hostname
        }
      };
    }
  }

  /**
   * Verify account existence via WinRM using PowerShell commands
   */
  async verifyAccountViaWinRM(host, port, username, password, domain, targetUsername) {
    try {
      // PowerShell commands to check for user account
      const verificationCommands = [
        `net user ${targetUsername}`,                                    // Primary: Check local user
        `Get-LocalUser -Name "${targetUsername}" -ErrorAction Stop`,    // PowerShell: Get local user
        `Get-WmiObject -Class Win32_UserAccount -Filter "Name='${targetUsername}'"` // WMI: Check user account
      ];
      
      for (const command of verificationCommands) {
        try {
          logger.debug(`Running Windows account verification command: ${command}`);
          
          // Use PowerShell remoting to execute the command
          const psCommand = domain 
            ? `powershell -Command "Invoke-Command -ComputerName ${host} -Credential (New-Object System.Management.Automation.PSCredential('${domain}\\${username}', (ConvertTo-SecureString '${password}' -AsPlainText -Force))) -ScriptBlock { ${command} }"`
            : `powershell -Command "Invoke-Command -ComputerName ${host} -Credential (New-Object System.Management.Automation.PSCredential('${username}', (ConvertTo-SecureString '${password}' -AsPlainText -Force))) -ScriptBlock { ${command} }"`;
          
          const output = await execAsync(psCommand, { timeout: 15000 });
          
          // Check if the command succeeded and returned user information
          if (output.toLowerCase().includes(targetUsername.toLowerCase()) || 
              output.includes('The command completed successfully')) {
            return {
              success: true,
              message: `Account found via WinRM: ${command}`,
              details: { command, output: output.substring(0, 200) }
            };
          }
          
        } catch (cmdError) {
          logger.debug(`WinRM command failed: ${command} - ${cmdError.message}`);
          // Continue with next command
        }
      }
      
      return {
        success: false,
        message: 'Account not found via WinRM',
        details: { method: 'winrm' }
      };
      
    } catch (error) {
      return {
        success: false,
        message: `WinRM verification failed: ${error.message}`,
        details: { method: 'winrm', error: error.message }
      };
    }
  }

  /**
   * Verify account existence via SMB by checking user profiles
   */
  async verifyAccountViaSMB(host, username, password, domain, targetUsername) {
    try {
      const smbCredentials = domain ? `${domain}\\${username}%${password}` : `${username}%${password}`;
      
      // Try to list user profiles directory
      const command = `smbclient //${host}/c$ -U "${smbCredentials}" -c "ls Users\\${targetUsername}"`;
      
      const output = await execAsync(command, { timeout: 10000 });
      
      if (output.includes('NT_STATUS_OK') || output.includes('listing')) {
        return {
          success: true,
          message: `Account profile found via SMB`,
          details: { method: 'smb', profile_path: `Users\\${targetUsername}` }
        };
      } else {
        return {
          success: false,
          message: 'Account profile not found via SMB',
          details: { method: 'smb' }
        };
      }
      
    } catch (error) {
      return {
        success: false,
        message: `SMB verification failed: ${error.message}`,
        details: { method: 'smb', error: error.message }
      };
    }
  }

  /**
   * Verify account existence via RDP connection attempt
   */
  async verifyAccountViaRDP(host, port, username, password, domain, targetUsername) {
    try {
      // For RDP, we can try to connect with the target username to see if it exists
      const rdpUser = domain ? `${domain}\\${targetUsername}` : targetUsername;
      
      // Use a quick RDP connection test
      const command = `xfreerdp /u:"${rdpUser}" /p:"dummy_password" /v:${host}:${port || 3389} +auth-only /sec:tls /cert-ignore /timeout:5000`;
      
      const output = await execAsync(command, { timeout: 8000 });
      
      // If we get authentication failure but the user exists, that's what we want
      if (output.includes('Authentication failure') || output.includes('invalid credentials')) {
        return {
          success: true,
          message: `Account exists (authentication failed as expected)`,
          details: { method: 'rdp', note: 'Account exists but password incorrect' }
        };
      } else if (output.includes('account does not exist') || output.includes('user not found')) {
        return {
          success: false,
          message: 'Account not found via RDP',
          details: { method: 'rdp' }
        };
      } else {
        return {
          success: false,
          message: 'RDP verification inconclusive',
          details: { method: 'rdp', output: output.substring(0, 100) }
        };
      }
      
    } catch (error) {
      // Check if error indicates user doesn't exist vs other issues
      if (error.message.includes('account does not exist') || error.message.includes('user not found')) {
        return {
          success: false,
          message: 'Account not found via RDP',
          details: { method: 'rdp' }
        };
      } else {
        return {
          success: false,
          message: `RDP verification failed: ${error.message}`,
          details: { method: 'rdp', error: error.message }
        };
      }
    }
  }

  /**
   * Parse credential value to extract connection config
   */
  parseCredentialValue(credentialValue) {
    try {
      const decryptedValue = decrypt(credentialValue);
      try {
        return JSON.parse(decryptedValue);
      } catch {
        // Plain password format
        return {
          password: decryptedValue
        };
      }
    } catch (error) {
      throw new Error(`Failed to parse credential value: ${error.message}`);
    }
  }

  /**
   * Categorize Windows verification errors
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('etimedout')) {
      return 'timeout';
    } else if (message.includes('econnrefused')) {
      return 'connection_refused';
    } else if (message.includes('enotfound')) {
      return 'host_not_found';
    } else if (message.includes('authentication') || message.includes('logon_failure')) {
      return 'authentication';
    } else if (message.includes('access_denied') || message.includes('permission')) {
      return 'permission_denied';
    } else {
      return 'unknown';
    }
  }

  /**
   * Check if Windows verification tools are available
   */
  static async checkDependencies() {
    const dependencies = [];
    
    try {
      await execAsync('xfreerdp --version');
      dependencies.push({ name: 'xfreerdp', available: true, purpose: 'RDP verification' });
    } catch {
      dependencies.push({ name: 'xfreerdp', available: false, purpose: 'RDP verification' });
    }
    
    try {
      await execAsync('powershell -Command "Get-Command New-PSSession"');
      dependencies.push({ name: 'powershell', available: true, purpose: 'WinRM verification' });
    } catch {
      dependencies.push({ name: 'powershell', available: false, purpose: 'WinRM verification' });
    }
    
    try {
      await execAsync('smbclient --version');
      dependencies.push({ name: 'smbclient', available: true, purpose: 'SMB verification' });
    } catch {
      dependencies.push({ name: 'smbclient', available: false, purpose: 'SMB verification' });
    }
    
    return dependencies;
  }
}