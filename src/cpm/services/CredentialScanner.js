/**
 * Credential Scanner Service
 * Scans the credentials table for pending/unverified credentials
 */

import supabase from '../../utils/supabaseClient.js';
import { logger } from '../utils/logger.js';

export class CredentialScanner {
  constructor(config) {
    this.config = config;
    this.batchSize = config.get('batchSize');
    this.scanInterval = config.get('scanInterval');
  }
  
  /**
   * Scan for credentials that need verification
   * @returns {Promise<Array>} Array of credentials to verify
   */
  async scanForCredentials() {
    try {
      logger.debug('Starting credential scan...');
      
      const { data: credentials, error } = await supabase
        .from('credentials')
        .select(`
          id,
          user_id,
          type,
          name,
          value,
          host,
          port,
          username,
          status,
          verified_at,
          last_verification_attempt,
          verification_error,
          created_at,
          updated_at
        `)
        .or(`status.eq.pending,verified_at.is.null`)
        .order('created_at', { ascending: true })
        .limit(this.batchSize);
      
      if (error) {
        logger.error('Failed to scan credentials:', error);
        throw error;
      }
      
      const count = credentials?.length || 0;
      logger.info(`📊 Found ${count} credentials requiring verification`);
      
      if (count > 0) {
        // Log summary by type
        const summary = credentials.reduce((acc, cred) => {
          acc[cred.type] = (acc[cred.type] || 0) + 1;
          return acc;
        }, {});
        
        logger.debug('Credential types to verify:', summary);
      }
      
      return credentials || [];
      
    } catch (error) {
      logger.error('Credential scan failed:', error);
      throw error;
    }
  }
  
  /**
   * Get credentials that have failed verification and need retry
   * @returns {Promise<Array>} Array of failed credentials to retry
   */
  async scanForRetries() {
    try {
      const retryThreshold = new Date(Date.now() - this.config.get('retryDelay'));
      
      const { data: credentials, error } = await supabase
        .from('credentials')
        .select(`
          id,
          user_id,
          type,
          name,
          value,
          host,
          port,
          username,
          status,
          verified_at,
          last_verification_attempt,
          verification_error,
          created_at,
          updated_at
        `)
        .eq('status', 'failed')
        .or(`last_verification_attempt.is.null,last_verification_attempt.lt.${retryThreshold.toISOString()}`)
        .order('last_verification_attempt', { ascending: true })
        .limit(Math.floor(this.batchSize / 2)); // Use half batch size for retries
      
      if (error) {
        logger.error('Failed to scan for retry credentials:', error);
        throw error;
      }
      
      const count = credentials?.length || 0;
      if (count > 0) {
        logger.info(`🔄 Found ${count} failed credentials ready for retry`);
      }
      
      return credentials || [];
      
    } catch (error) {
      logger.error('Retry credential scan failed:', error);
      throw error;
    }
  }
  
  /**
   * Get verification statistics
   * @returns {Promise<Object>} Verification statistics
   */
  async getVerificationStats() {
    try {
      const { data: stats, error } = await supabase
        .from('credentials')
        .select('status, type')
        .not('status', 'is', null);
      
      if (error) {
        logger.error('Failed to get verification stats:', error);
        return null;
      }
      
      const summary = stats.reduce((acc, cred) => {
        if (!acc[cred.status]) acc[cred.status] = {};
        acc[cred.status][cred.type] = (acc[cred.status][cred.type] || 0) + 1;
        return acc;
      }, {});
      
      const totals = stats.reduce((acc, cred) => {
        acc[cred.status] = (acc[cred.status] || 0) + 1;
        return acc;
      }, {});
      
      return {
        totals,
        byType: summary,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Failed to get verification stats:', error);
      return null;
    }
  }
  
  /**
   * Clean up old verification attempts (housekeeping)
   */
  async cleanupOldAttempts() {
    try {
      const cutoffDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
      
      const { error } = await supabase
        .from('credentials')
        .update({
          verification_error: null,
          last_verification_attempt: null
        })
        .eq('status', 'failed')
        .lt('last_verification_attempt', cutoffDate.toISOString());
      
      if (error) {
        logger.warn('Failed to cleanup old verification attempts:', error);
      } else {
        logger.debug('Cleaned up old verification attempts');
      }
      
    } catch (error) {
      logger.warn('Cleanup operation failed:', error);
    }
  }
  
  /**
   * Filter credentials by type and enabled features
   * @param {Array} credentials - Credentials to filter
   * @returns {Array} Filtered credentials
   */
  filterByEnabledTypes(credentials) {
    return credentials.filter(cred => {
      // Check by credential type first
      switch (cred.type) {
        case 'ssh':
          return this.config.get('enableSSHVerification');
        case 'api_token':
          return this.config.get('enableAPIVerification');
        case 'certificate':
          return this.config.get('enableCertificateVerification');
        case 'database':
          return this.config.get('enableDatabaseVerification');
        case 'password':
          // For password type, use port-based detection since system_type is not available
          // Port-based detection for password credentials
          if (cred.port) {
            const port = parseInt(cred.port);
            if (port === 3389) return this.config.get('enableWindowsVerification'); // RDP
            else if (port === 22) return this.config.get('enableSSHVerification'); // SSH
            else if ([3306, 5432, 1521, 1433, 27017, 6379].includes(port)) {
              return this.config.get('enableDatabaseVerification'); // Database ports
            }
            else if ([80, 443, 8080, 8443].includes(port)) {
              return this.config.get('enableWebsiteVerification'); // Web ports
            }
          }
          return false; // Unknown password type
        default:
          logger.warn(`Unknown credential type: ${cred.type}`);
          return false;
      }
    });
  }
}