/**
 * Central Policy Manager Service
 * Main service that orchestrates credential verification
 */

import supabaseService from '../../utils/supabaseServiceClient.js';
import { logger } from '../utils/logger.js';
import { CredentialScanner } from './CredentialScanner.js';
import { AuditLogger } from './AuditLogger.js';
import { SSHVerifier } from '../verifiers/SSHVerifier.js';
import { APIVerifier } from '../verifiers/APIVerifier.js';
import { WindowsVerifier } from '../verifiers/WindowsVerifier.js';
import { DatabaseVerifier } from '../verifiers/DatabaseVerifier.js';
import { WebsiteVerifier } from '../verifiers/WebsiteVerifier.js';
import { CertificateVerifier } from '../verifiers/CertificateVerifier.js';

export class CPMService {
  constructor(config) {
    this.config = config;
    this.isRunning = false;
    this.scanInterval = null;
    this.activeVerifications = new Map();
    
    // Initialize services
    this.scanner = new CredentialScanner(config);
    this.auditLogger = new AuditLogger(config);
    
    // Initialize verifiers
    this.verifiers = {
      ssh: new SSHVerifier(config),
      api_token: new APIVerifier(config),
      password: new WindowsVerifier(config), // For Windows/password credentials
      database: new DatabaseVerifier(config),
      certificate: new CertificateVerifier(config),
      // Website verifier can handle multiple authentication types
      website: new WebsiteVerifier(config),
      // Map system types to appropriate verifiers
      windows: new WindowsVerifier(config),
      linux: new SSHVerifier(config), // Linux typically uses SSH
      application: new WebsiteVerifier(config), // Applications often use HTTP auth
      cloud: new APIVerifier(config), // Cloud services typically use API tokens
      network: new SSHVerifier(config) // Network devices often use SSH
    };
    
    // Use service client for database operations (bypasses RLS)
    this.db = supabaseService;
    
    // Performance metrics
    this.metrics = {
      scansCompleted: 0,
      credentialsVerified: 0,
      verificationSuccesses: 0,
      verificationFailures: 0,
      lastScanTime: null,
      averageVerificationTime: 0,
      startTime: null
    };
  }
  
  /**
   * Start the CPM service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('CPM Service is already running');
      return;
    }
    
    logger.info('🚀 Starting CPM Service...');
    this.isRunning = true;
    this.metrics.startTime = Date.now();
    
    // Log service startup
    await this.auditLogger.logSystemEvent('service_started', 'cpm-service', {
      config: {
        scanInterval: this.config.get('scanInterval'),
        batchSize: this.config.get('batchSize'),
        maxConcurrentVerifications: this.config.get('maxConcurrentVerifications')
      }
    });
    
    // Start the main verification loop
    this.scheduleNextScan();
    
    logger.info('✅ CPM Service started successfully');
  }
  
  /**
   * Stop the CPM service
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('CPM Service is not running');
      return;
    }
    
    logger.info('🛑 Stopping CPM Service...');
    this.isRunning = false;
    
    // Clear scan interval
    if (this.scanInterval) {
      clearTimeout(this.scanInterval);
      this.scanInterval = null;
    }
    
    // Wait for active verifications to complete
    if (this.activeVerifications.size > 0) {
      logger.info(`⏳ Waiting for ${this.activeVerifications.size} active verifications to complete...`);
      
      const timeout = 30000; // 30 second timeout
      const startTime = Date.now();
      
      while (this.activeVerifications.size > 0 && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (this.activeVerifications.size > 0) {
        logger.warn(`⚠️ Forcibly stopping with ${this.activeVerifications.size} active verifications`);
      }
    }
    
    // Log service shutdown
    const uptime = Date.now() - this.metrics.startTime;
    await this.auditLogger.logSystemEvent('service_stopped', 'cpm-service', {
      uptime: uptime,
      metrics: this.getMetrics()
    });
    
    logger.info('✅ CPM Service stopped successfully');
  }
  
  /**
   * Schedule the next credential scan
   */
  scheduleNextScan() {
    if (!this.isRunning) return;
    
    this.scanInterval = setTimeout(async () => {
      try {
        await this.performScan();
      } catch (error) {
        logger.error('Scan failed:', error);
        await this.auditLogger.logSecurityEvent('scan_failure', 'medium', {
          error: error.message,
          stack: error.stack
        });
      } finally {
        this.scheduleNextScan();
      }
    }, this.config.get('scanInterval'));
  }
  
  /**
   * Perform a credential verification scan
   */
  async performScan() {
    const scanStartTime = Date.now();
    logger.info('🔍 Starting credential verification scan...');
    
    try {
      // Get credentials to verify
      const [pendingCredentials, retryCredentials] = await Promise.all([
        this.scanner.scanForCredentials(),
        this.scanner.scanForRetries()
      ]);
      
      const allCredentials = [...pendingCredentials, ...retryCredentials];
      const filteredCredentials = this.scanner.filterByEnabledTypes(allCredentials);
      
      if (filteredCredentials.length === 0) {
        logger.info('📭 No credentials require verification');
        this.metrics.lastScanTime = Date.now();
        this.metrics.scansCompleted++;
        return;
      }
      
      logger.info(`📋 Processing ${filteredCredentials.length} credentials for verification`);
      
      // Process credentials in batches with concurrency control
      const maxConcurrent = this.config.get('maxConcurrentVerifications');
      const results = await this.processCredentialsBatch(filteredCredentials, maxConcurrent);
      
      // Log batch completion
      await this.auditLogger.logBatchVerification(results);
      
      // Update metrics
      this.updateMetrics(results, scanStartTime);
      
      // Cleanup old data periodically
      if (this.metrics.scansCompleted % 10 === 0) {
        await this.performHousekeeping();
      }
      
      const scanDuration = Date.now() - scanStartTime;
      logger.info(`✅ Scan completed in ${scanDuration}ms - ${results.length} credentials processed`);
      
    } catch (error) {
      logger.error('Scan failed:', error);
      throw error;
    }
  }
  
  /**
   * Process credentials in batches with concurrency control
   * @param {Array} credentials - Credentials to process
   * @param {number} maxConcurrent - Maximum concurrent verifications
   * @returns {Promise<Array>} Array of verification results
   */
  async processCredentialsBatch(credentials, maxConcurrent) {
    const results = [];
    const processing = [];
    
    for (const credential of credentials) {
      // Wait if we've reached max concurrency
      if (processing.length >= maxConcurrent) {
        const result = await Promise.race(processing);
        const index = processing.findIndex(p => p.promise === result.promise);
        processing.splice(index, 1);
        results.push(result);
      }
      
      // Start verification
      const verificationPromise = this.verifyCredential(credential);
      processing.push({
        promise: verificationPromise,
        credentialId: credential.id
      });
    }
    
    // Wait for remaining verifications
    while (processing.length > 0) {
      const result = await Promise.race(processing.map(p => p.promise));
      const index = processing.findIndex(p => p.promise === result.promise);
      processing.splice(index, 1);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Verify a single credential
   * @param {Object} credential - Credential to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyCredential(credential) {
    const startTime = Date.now();
    const verificationId = `${credential.id}-${Date.now()}`;
    
    // Track active verification
    this.activeVerifications.set(verificationId, {
      credentialId: credential.id,
      startTime,
      type: credential.type
    });
    
    try {
      logger.debug(`Starting verification: ${credential.id} (${credential.type})`);
      
      // Get appropriate verifier based on credential type
      let verifier = this.verifiers[credential.type];
      
      // Fallback mappings for common cases
      if (!verifier) {
        switch (credential.type) {
          case 'password':
            // Default to Windows verifier for password type
            verifier = this.verifiers.windows;
            // Port-based detection
            if (!verifier && credential.port) {
              const port = parseInt(credential.port);
              if (port === 3389) verifier = this.verifiers.windows; // RDP
              else if (port === 22) verifier = this.verifiers.ssh; // SSH
              else if ([3306, 5432, 1521, 1433, 27017, 6379].includes(port)) {
                verifier = this.verifiers.database; // Database ports
              }
              else if ([80, 443, 8080, 8443].includes(port)) {
                verifier = this.verifiers.website; // Web ports
              }
            }
            break;
        }
      }
      
      if (!verifier) {
        throw new Error(`No verifier available for credential type '${credential.type}'`);
      }
      
      // Perform verification with timeout
      const verificationPromise = verifier.verify(credential);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Verification timeout')), this.config.get('verificationTimeout'));
      });
      
      const verificationResult = await Promise.race([verificationPromise, timeoutPromise]);
      
      // Update credential status in database
      await this.updateCredentialStatus(credential, verificationResult);
      
      // Log audit event
      await this.auditLogger.logVerificationAudit(credential, verificationResult);
      
      const duration = Date.now() - startTime;
      
      return {
        credential,
        verificationResult,
        duration,
        startTime: new Date(startTime).toISOString(),
        success: true
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Verification failed for ${credential.id}:`, error);
      
      const failureResult = {
        success: false,
        message: error.message,
        error: error.message,
        errorCategory: 'system_error'
      };
      
      // Update credential status
      await this.updateCredentialStatus(credential, failureResult);
      
      // Log audit event
      await this.auditLogger.logVerificationAudit(credential, failureResult);
      
      return {
        credential,
        verificationResult: failureResult,
        duration,
        startTime: new Date(startTime).toISOString(),
        success: false,
        error: error.message
      };
      
    } finally {
      // Remove from active verifications
      this.activeVerifications.delete(verificationId);
    }
  }
  
  /**
   * Update credential status in database
   * @param {Object} credential - Credential to update
   * @param {Object} verificationResult - Verification result
   */
  async updateCredentialStatus(credential, verificationResult) {
    try {
      const oldStatus = credential.status;
      const newStatus = verificationResult.success ? 'verified' : 'failed';
      const now = new Date().toISOString();
      
      const updateData = {
        status: newStatus,
        last_verification_attempt: now,
        verification_error: verificationResult.success ? null : verificationResult.message
      };
      
      if (verificationResult.success) {
        updateData.verified_at = now;
      }
      
      const { error } = await supabase
        .from('credentials')
        .update(updateData)
        .eq('id', credential.id);
      
      if (error) {
        logger.error(`Failed to update credential status for ${credential.id}:`, error);
        throw error;
      }
      
      // Log status change
      await this.auditLogger.logStatusUpdate(credential, oldStatus, newStatus, {
        verification_result: verificationResult.success ? 'success' : 'failed',
        verification_message: verificationResult.message
      });
      
      logger.debug(`Updated credential ${credential.id} status: ${oldStatus} → ${newStatus}`);
      
    } catch (error) {
      logger.error(`Failed to update credential status: ${error.message}`);
      // Don't throw - this shouldn't stop the verification process
    }
  }
  
  /**
   * Update service metrics
   * @param {Array} results - Verification results
   * @param {number} scanStartTime - Scan start time
   */
  updateMetrics(results, scanStartTime) {
    this.metrics.scansCompleted++;
    this.metrics.credentialsVerified += results.length;
    this.metrics.verificationSuccesses += results.filter(r => r.verificationResult.success).length;
    this.metrics.verificationFailures += results.filter(r => !r.verificationResult.success).length;
    this.metrics.lastScanTime = Date.now();
    
    // Update average verification time
    const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    if (results.length > 0) {
      this.metrics.averageVerificationTime = totalTime / results.length;
    }
  }
  
  /**
   * Perform housekeeping tasks
   */
  async performHousekeeping() {
    try {
      logger.info('🧹 Performing housekeeping tasks...');
      
      // Cleanup old audit logs
      const deletedLogs = await this.auditLogger.cleanupOldLogs();
      
      // Cleanup old verification attempts
      await this.scanner.cleanupOldAttempts();
      
      // Log housekeeping completion
      await this.auditLogger.logSystemEvent('housekeeping_completed', 'cpm-service', {
        deleted_audit_logs: deletedLogs
      });
      
      logger.info('✅ Housekeeping completed');
      
    } catch (error) {
      logger.error('Housekeeping failed:', error);
    }
  }
  
  /**
   * Get service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    const uptime = this.metrics.startTime ? Date.now() - this.metrics.startTime : 0;
    
    return {
      ...this.metrics,
      uptime,
      isRunning: this.isRunning,
      activeVerifications: this.activeVerifications.size,
      successRate: this.metrics.credentialsVerified > 0 
        ? (this.metrics.verificationSuccesses / this.metrics.credentialsVerified * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  /**
   * Get service status
   * @returns {Object} Service status
   */
  async getStatus() {
    const stats = await this.scanner.getVerificationStats();
    const auditStats = await this.auditLogger.getAuditStats();
    
    return {
      service: {
        status: this.isRunning ? 'running' : 'stopped',
        metrics: this.getMetrics(),
        config: {
          scanInterval: this.config.get('scanInterval'),
          batchSize: this.config.get('batchSize'),
          maxConcurrentVerifications: this.config.get('maxConcurrentVerifications')
        }
      },
      credentials: stats,
      audit: auditStats
    };
  }
}