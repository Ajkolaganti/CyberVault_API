/**
 * CPM Configuration Manager
 * Handles all configuration for the Central Policy Manager
 */

import { ENCRYPTION_KEY, ENCRYPTION_IV } from '../../config/env.js';

export class CPMConfig {
  static instance = null;
  
  constructor() {
    this.config = {
      // Scanning configuration
      scanInterval: parseInt(process.env.CPM_SCAN_INTERVAL) || 30000, // 30 seconds
      batchSize: parseInt(process.env.CPM_BATCH_SIZE) || 10,
      maxConcurrentVerifications: parseInt(process.env.CPM_MAX_CONCURRENT) || 5,
      
      // Verification timeouts (in milliseconds)
      verificationTimeout: parseInt(process.env.CPM_VERIFICATION_TIMEOUT) || 30000, // 30 seconds
      sshTimeout: parseInt(process.env.CPM_SSH_TIMEOUT) || 15000, // 15 seconds
      apiTimeout: parseInt(process.env.CPM_API_TIMEOUT) || 10000, // 10 seconds
      windowsTimeout: parseInt(process.env.CPM_WINDOWS_TIMEOUT) || 20000, // 20 seconds
      databaseTimeout: parseInt(process.env.CPM_DATABASE_TIMEOUT) || 15000, // 15 seconds
      websiteTimeout: parseInt(process.env.CPM_WEBSITE_TIMEOUT) || 10000, // 10 seconds
      certificateTimeout: parseInt(process.env.CPM_CERTIFICATE_TIMEOUT) || 10000, // 10 seconds
      
      // Retry configuration
      maxRetries: parseInt(process.env.CPM_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.CPM_RETRY_DELAY) || 5000, // 5 seconds
      exponentialBackoff: process.env.CPM_EXPONENTIAL_BACKOFF !== 'false',
      
      // Security configuration
      encryptionKey: ENCRYPTION_KEY,
      encryptionIV: ENCRYPTION_IV,
      
      // Feature flags
      enableSSHVerification: process.env.CPM_ENABLE_SSH !== 'false',
      enableAPIVerification: process.env.CPM_ENABLE_API !== 'false',
      enableCertificateVerification: process.env.CPM_ENABLE_CERT !== 'false',
      enableDatabaseVerification: process.env.CPM_ENABLE_DB !== 'false',
      enableWindowsVerification: process.env.CPM_ENABLE_WINDOWS !== 'false',
      enableWebsiteVerification: process.env.CPM_ENABLE_WEBSITE !== 'false',
      
      // Logging configuration
      logLevel: process.env.CPM_LOG_LEVEL || 'info',
      logToFile: process.env.CPM_LOG_TO_FILE === 'true',
      logFile: process.env.CPM_LOG_FILE || './logs/cpm.log',
      
      // Test endpoints
      testApiEndpoint: process.env.CPM_TEST_API_ENDPOINT || 'https://httpbin.org/bearer',
      fallbackTestEndpoint: 'https://httpbin.org/get',
      
      // Health monitoring
      enableHealthCheck: process.env.CPM_HEALTH_CHECK !== 'false',
      healthCheckPort: parseInt(process.env.CPM_HEALTH_PORT) || 3001,
      
      // Metric collection
      enableMetrics: process.env.CPM_ENABLE_METRICS === 'true',
      metricsRetentionDays: parseInt(process.env.CPM_METRICS_RETENTION) || 30
    };
  }
  
  static getInstance() {
    if (!CPMConfig.instance) {
      CPMConfig.instance = new CPMConfig();
    }
    return CPMConfig.instance;
  }
  
  get(key) {
    return this.config[key];
  }
  
  set(key, value) {
    this.config[key] = value;
  }
  
  getAll() {
    return { ...this.config };
  }
  
  validate() {
    const required = ['encryptionKey', 'encryptionIV'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      console.error(`❌ Missing required configuration: ${missing.join(', ')}`);
      return false;
    }
    
    // Validate numeric values
    const numericFields = [
      'scanInterval', 'batchSize', 'maxConcurrentVerifications',
      'verificationTimeout', 'sshTimeout', 'apiTimeout', 'windowsTimeout',
      'databaseTimeout', 'websiteTimeout', 'certificateTimeout',
      'maxRetries', 'retryDelay'
    ];
    
    for (const field of numericFields) {
      if (isNaN(this.config[field]) || this.config[field] <= 0) {
        console.error(`❌ Invalid ${field}: ${this.config[field]}`);
        return false;
      }
    }
    
    // Validate encryption key format
    if (!this.config.encryptionKey || this.config.encryptionKey.length !== 64) {
      console.error('❌ Invalid encryption key format');
      return false;
    }
    
    return true;
  }
  
  // Environment-specific configurations
  isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }
  
  isProduction() {
    return process.env.NODE_ENV === 'production';
  }
  
  isTest() {
    return process.env.NODE_ENV === 'test';
  }
}