/**
 * Certificate Credential Verifier
 * Verifies SSL/TLS certificates and client certificates
 */

import crypto from 'crypto';
import tls from 'tls';
import fs from 'fs';
import { X509Certificate } from 'crypto';
import { logger } from '../utils/logger.js';
import { decrypt } from '../../utils/encryption.js';

export class CertificateVerifier {
  constructor(config) {
    this.config = config;
    this.timeout = config.get('certificateTimeout') || config.get('verificationTimeout');
  }
  
  /**
   * Verify certificate credential
   * @param {Object} credential - Credential object from database
   * @returns {Promise<Object>} Verification result
   */
  async verify(credential) {
    const startTime = Date.now();
    logger.info(`🔒 Verifying Certificate credential: ${credential.id} (${credential.name})`);
    
    try {
      // Decrypt the credential value
      const decryptedValue = decrypt(credential.value);
      let certificateConfig;
      
      try {
        certificateConfig = JSON.parse(decryptedValue);
      } catch (parseError) {
        // If not JSON, treat as PEM certificate
        certificateConfig = {
          certificate: decryptedValue,
          type: 'client_cert',
          host: credential.host,
          port: credential.port || 443
        };
      }
      
      // Validate required fields
      if (!certificateConfig.certificate && !certificateConfig.certificatePath) {
        throw new Error('Missing certificate data or path');
      }
      
      const certType = (certificateConfig.type || 'client_cert').toLowerCase();
      
      logger.debug(`Verifying ${certType} certificate for ${certificateConfig.host || 'standalone'}`);
      
      let verificationResult;
      
      // Route to appropriate verification method
      switch (certType) {
        case 'client_cert':
        case 'client_certificate':
          verificationResult = await this.verifyClientCertificate(certificateConfig);
          break;
        case 'server_cert':
        case 'server_certificate':
        case 'ssl_cert':
          verificationResult = await this.verifyServerCertificate(certificateConfig);
          break;
        case 'ca_cert':
        case 'root_cert':
          verificationResult = await this.verifyCACertificate(certificateConfig);
          break;
        case 'code_signing':
          verificationResult = await this.verifyCodeSigningCertificate(certificateConfig);
          break;
        default:
          // Try to auto-detect certificate type
          verificationResult = await this.verifyAutoDetect(certificateConfig);
      }
      
      const duration = Date.now() - startTime;
      logger.performance('Certificate verification', duration, {
        credentialId: credential.id,
        host: certificateConfig.host,
        certType: certType
      });
      
      if (verificationResult.success) {
        logger.info(`✅ Certificate credential verified successfully: ${credential.id}`);
      } else {
        logger.warn(`⚠️ Certificate credential verification failed: ${credential.id} - ${verificationResult.message}`);
      }
      
      return {
        ...verificationResult,
        details: {
          ...verificationResult.details,
          host: certificateConfig.host,
          port: certificateConfig.port,
          certType: certType,
          connectionTime: duration
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Certificate verification failed for ${credential.id}:`, error.message);
      
      return this.createErrorResult(error, credential, duration);
    }
  }
  
  /**
   * Verify client certificate
   */
  async verifyClientCertificate(config) {
    try {
      // Get certificate data
      let certData = config.certificate;
      if (config.certificatePath) {
        certData = fs.readFileSync(config.certificatePath, 'utf8');
      }
      
      // Parse certificate
      const cert = new X509Certificate(certData);
      
      // Basic certificate validation
      const now = new Date();
      const validFrom = new Date(cert.validFrom);
      const validTo = new Date(cert.validTo);
      
      let validationIssues = [];
      
      if (now < validFrom) {
        validationIssues.push('Certificate is not yet valid');
      }
      
      if (now > validTo) {
        validationIssues.push('Certificate has expired');
      }
      
      // Test client certificate with server if host is provided
      let connectionTest = null;
      if (config.host) {
        try {
          connectionTest = await this.testClientCertificateConnection(config, certData);
        } catch (error) {
          logger.debug('Client certificate connection test failed:', error.message);
          connectionTest = {
            success: false,
            error: error.message
          };
        }
      }
      
      const hasIssues = validationIssues.length > 0;
      const connectionFailed = connectionTest && !connectionTest.success;
      
      return {
        success: !hasIssues && !connectionFailed,
        message: hasIssues ? 
          `Certificate validation issues: ${validationIssues.join(', ')}` :
          connectionFailed ?
            `Certificate connection failed: ${connectionTest.error}` :
            'Client certificate validation successful',
        errorCategory: hasIssues ? 'certificate_invalid' : connectionFailed ? 'connection' : null,
        details: {
          method: 'client_cert',
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.validFrom,
          validTo: cert.validTo,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint,
          keyUsage: cert.keyUsage,
          validationIssues: validationIssues,
          connectionTest: connectionTest,
          daysUntilExpiry: Math.ceil((validTo - now) / (1000 * 60 * 60 * 24))
        }
      };
      
    } catch (error) {
      throw new Error(`Client certificate verification failed: ${error.message}`);
    }
  }
  
  /**
   * Test client certificate connection to server
   */
  async testClientCertificateConnection(config, certData) {
    return new Promise((resolve, reject) => {
      const options = {
        host: config.host,
        port: config.port || 443,
        cert: certData,
        key: config.privateKey || certData, // Assume cert includes key if not separate
        passphrase: config.passphrase,
        timeout: this.timeout,
        rejectUnauthorized: config.rejectUnauthorized !== false
      };
      
      const socket = tls.connect(options, () => {
        socket.destroy();
        resolve({
          success: true,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError,
          peerCertificate: socket.getPeerCertificate()
        });
      });
      
      socket.on('error', (error) => {
        reject(error);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }
  
  /**
   * Verify server certificate (SSL/TLS)
   */
  async verifyServerCertificate(config) {
    try {
      const host = config.host;
      const port = config.port || 443;
      
      if (!host) {
        throw new Error('Host is required for server certificate verification');
      }
      
      return new Promise((resolve, reject) => {
        const options = {
          host: host,
          port: port,
          timeout: this.timeout,
          rejectUnauthorized: false // We'll manually check the certificate
        };
        
        const socket = tls.connect(options, () => {
          try {
            const cert = socket.getPeerCertificate(true);
            const x509 = new X509Certificate(cert.raw);
            
            socket.destroy();
            
            // Analyze certificate
            const now = new Date();
            const validFrom = new Date(x509.validFrom);
            const validTo = new Date(x509.validTo);
            
            let validationIssues = [];
            
            if (now < validFrom) {
              validationIssues.push('Certificate is not yet valid');
            }
            
            if (now > validTo) {
              validationIssues.push('Certificate has expired');
            }
            
            // Check hostname matching
            const subjectAltNames = x509.subjectAltName ? 
              x509.subjectAltName.split(', ').map(san => san.replace('DNS:', '')) : 
              [];
            
            const hostMatches = subjectAltNames.includes(host) || 
                               x509.subject.includes(`CN=${host}`) ||
                               subjectAltNames.some(san => san.startsWith('*.') && host.endsWith(san.substring(1)));
            
            if (!hostMatches) {
              validationIssues.push('Certificate hostname does not match');
            }
            
            const hasIssues = validationIssues.length > 0;
            
            resolve({
              success: !hasIssues,
              message: hasIssues ? 
                `Server certificate issues: ${validationIssues.join(', ')}` :
                'Server certificate validation successful',
              errorCategory: hasIssues ? 'certificate_invalid' : null,
              details: {
                method: 'server_cert',
                subject: x509.subject,
                issuer: x509.issuer,
                validFrom: x509.validFrom,
                validTo: x509.validTo,
                serialNumber: x509.serialNumber,
                fingerprint: x509.fingerprint,
                subjectAltName: x509.subjectAltName,
                validationIssues: validationIssues,
                hostMatches: hostMatches,
                daysUntilExpiry: Math.ceil((validTo - now) / (1000 * 60 * 60 * 24)),
                authorized: socket.authorized,
                authorizationError: socket.authorizationError
              }
            });
            
          } catch (error) {
            socket.destroy();
            reject(error);
          }
        });
        
        socket.on('error', (error) => {
          reject(error);
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        });
      });
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Verify CA certificate
   */
  async verifyCACertificate(config) {
    try {
      // Get certificate data
      let certData = config.certificate;
      if (config.certificatePath) {
        certData = fs.readFileSync(config.certificatePath, 'utf8');
      }
      
      // Parse certificate
      const cert = new X509Certificate(certData);
      
      // Check if it's a CA certificate
      const isCA = cert.ca === true;
      const keyUsage = cert.keyUsage || [];
      const canSignCerts = keyUsage.includes('keyCertSign') || keyUsage.includes('cRLSign');
      
      // Basic validation
      const now = new Date();
      const validFrom = new Date(cert.validFrom);
      const validTo = new Date(cert.validTo);
      
      let validationIssues = [];
      
      if (!isCA && !canSignCerts) {
        validationIssues.push('Certificate is not marked as CA certificate');
      }
      
      if (now < validFrom) {
        validationIssues.push('Certificate is not yet valid');
      }
      
      if (now > validTo) {
        validationIssues.push('Certificate has expired');
      }
      
      const hasIssues = validationIssues.length > 0;
      
      return {
        success: !hasIssues,
        message: hasIssues ? 
          `CA certificate issues: ${validationIssues.join(', ')}` :
          'CA certificate validation successful',
        errorCategory: hasIssues ? 'certificate_invalid' : null,
        details: {
          method: 'ca_cert',
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.validFrom,
          validTo: cert.validTo,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint,
          isCA: isCA,
          keyUsage: keyUsage,
          validationIssues: validationIssues,
          daysUntilExpiry: Math.ceil((validTo - now) / (1000 * 60 * 60 * 24))
        }
      };
      
    } catch (error) {
      throw new Error(`CA certificate verification failed: ${error.message}`);
    }
  }
  
  /**
   * Verify code signing certificate
   */
  async verifyCodeSigningCertificate(config) {
    try {
      // Get certificate data
      let certData = config.certificate;
      if (config.certificatePath) {
        certData = fs.readFileSync(config.certificatePath, 'utf8');
      }
      
      // Parse certificate
      const cert = new X509Certificate(certData);
      
      // Check key usage for code signing
      const keyUsage = cert.keyUsage || [];
      const extKeyUsage = cert.extKeyUsage || [];
      
      const canSignCode = keyUsage.includes('digitalSignature') && 
                         (extKeyUsage.includes('codeSigning') || extKeyUsage.includes('1.3.6.1.5.5.7.3.3'));
      
      // Basic validation
      const now = new Date();
      const validFrom = new Date(cert.validFrom);
      const validTo = new Date(cert.validTo);
      
      let validationIssues = [];
      
      if (!canSignCode) {
        validationIssues.push('Certificate is not authorized for code signing');
      }
      
      if (now < validFrom) {
        validationIssues.push('Certificate is not yet valid');
      }
      
      if (now > validTo) {
        validationIssues.push('Certificate has expired');
      }
      
      const hasIssues = validationIssues.length > 0;
      
      return {
        success: !hasIssues,
        message: hasIssues ? 
          `Code signing certificate issues: ${validationIssues.join(', ')}` :
          'Code signing certificate validation successful',
        errorCategory: hasIssues ? 'certificate_invalid' : null,
        details: {
          method: 'code_signing',
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.validFrom,
          validTo: cert.validTo,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint,
          keyUsage: keyUsage,
          extKeyUsage: extKeyUsage,
          canSignCode: canSignCode,
          validationIssues: validationIssues,
          daysUntilExpiry: Math.ceil((validTo - now) / (1000 * 60 * 60 * 24))
        }
      };
      
    } catch (error) {
      throw new Error(`Code signing certificate verification failed: ${error.message}`);
    }
  }
  
  /**
   * Auto-detect certificate type and verify
   */
  async verifyAutoDetect(config) {
    try {
      // Get certificate data
      let certData = config.certificate;
      if (config.certificatePath) {
        certData = fs.readFileSync(config.certificatePath, 'utf8');
      }
      
      // Parse certificate to determine type
      const cert = new X509Certificate(certData);
      const keyUsage = cert.keyUsage || [];
      const extKeyUsage = cert.extKeyUsage || [];
      
      let detectedType;
      let verificationResult;
      
      // Detect certificate type based on usage and properties
      if (cert.ca === true || keyUsage.includes('keyCertSign')) {
        detectedType = 'ca_cert';
        verificationResult = await this.verifyCACertificate(config);
      } else if (extKeyUsage.includes('codeSigning') || extKeyUsage.includes('1.3.6.1.5.5.7.3.3')) {
        detectedType = 'code_signing';
        verificationResult = await this.verifyCodeSigningCertificate(config);
      } else if (config.host) {
        detectedType = 'server_cert';
        verificationResult = await this.verifyServerCertificate(config);
      } else {
        detectedType = 'client_cert';
        verificationResult = await this.verifyClientCertificate(config);
      }
      
      return {
        ...verificationResult,
        message: `${verificationResult.message} (auto-detected as ${detectedType})`,
        details: {
          ...verificationResult.details,
          autoDetected: true,
          detectedType: detectedType
        }
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Create error result with categorization
   */
  createErrorResult(error, credential, duration) {
    let errorCategory = 'unknown';
    let userFriendlyMessage = error.message;
    
    if (error.message.includes('timeout')) {
      errorCategory = 'timeout';
      userFriendlyMessage = 'Certificate verification timeout';
    } else if (error.message.includes('certificate') && error.message.includes('invalid')) {
      errorCategory = 'certificate_invalid';
      userFriendlyMessage = 'Invalid certificate format or content';
    } else if (error.message.includes('expired')) {
      errorCategory = 'certificate_expired';
      userFriendlyMessage = 'Certificate has expired';
    } else if (error.message.includes('Missing')) {
      errorCategory = 'configuration';
      userFriendlyMessage = 'Invalid certificate credential configuration';
    }
    
    return {
      success: false,
      message: userFriendlyMessage,
      error: error.message,
      errorCategory,
      details: {
        host: credential.host,
        port: credential.port,
        connectionTime: duration,
        errorType: error.constructor.name
      }
    };
  }
  
  /**
   * Validate certificate credential format
   */
  validateCredential(credential) {
    const errors = [];
    
    try {
      const decryptedValue = decrypt(credential.value);
      let certificateConfig;
      
      try {
        certificateConfig = JSON.parse(decryptedValue);
      } catch {
        // Plain certificate - validate PEM format
        if (!decryptedValue.includes('BEGIN CERTIFICATE')) {
          errors.push('Certificate does not appear to be in PEM format');
        }
        return { valid: errors.length === 0, errors };
      }
      
      // Validate JSON format
      if (!certificateConfig.certificate && !certificateConfig.certificatePath) {
        errors.push('Missing certificate data or path');
      }
      
      if (certificateConfig.certificate && !certificateConfig.certificate.includes('BEGIN CERTIFICATE')) {
        errors.push('Certificate data does not appear to be in PEM format');
      }
      
      if (certificateConfig.type) {
        const validTypes = ['client_cert', 'server_cert', 'ca_cert', 'code_signing'];
        if (!validTypes.includes(certificateConfig.type.toLowerCase())) {
          errors.push(`Invalid certificate type (must be one of: ${validTypes.join(', ')})`);
        }
      }
      
      if (certificateConfig.port && (isNaN(certificateConfig.port) || certificateConfig.port < 1 || certificateConfig.port > 65535)) {
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
   * Generate test certificate credential for development
   */
  static generateTestCredential() {
    return {
      id: 'test-cert-' + Date.now(),
      user_id: 'test-user',
      type: 'certificate',
      name: 'Test SSL Certificate',
      host: 'example.com',
      port: 443,
      value: JSON.stringify({
        type: 'server_cert',
        host: 'example.com',
        port: 443
      }),
      status: 'pending',
      created_at: new Date().toISOString()
    };
  }
}