/**
 * Audit Logger Service
 * Handles audit logging for CPM operations
 */

import supabase from '../../utils/supabaseClient.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class AuditLogger {
  constructor(config) {
    this.config = config;
    this.systemUserId = 'cpm-system'; // Special user ID for CPM operations
  }
  
  /**
   * Log credential verification audit event
   * @param {Object} credential - The credential that was verified
   * @param {Object} verificationResult - Result of the verification
   * @returns {Promise<Object>} Audit log entry
   */
  async logVerificationAudit(credential, verificationResult) {
    try {
      const auditEntry = {
        id: uuidv4(),
        user_id: credential.user_id,
        action: 'verification',
        resource: this.getResourceIdentifier(credential),
        metadata: {
          credential_id: credential.id,
          credential_name: credential.name,
          credential_type: credential.type,
          verification_result: verificationResult.success ? 'success' : 'failed',
          verification_message: verificationResult.message,
          verification_details: verificationResult.details,
          verification_error: verificationResult.error || null,
          verification_category: verificationResult.errorCategory || null,
          performed_by: 'cpm-system',
          verification_timestamp: new Date().toISOString(),
          host: credential.host || null,
          username: credential.username || null
        },
        created_at: new Date().toISOString()
      };
      
      // Insert audit log
      const { data, error } = await supabase
        .from('audit_logs')
        .insert([auditEntry])
        .select()
        .single();
      
      if (error) {
        logger.error('Failed to insert audit log:', error);
        throw error;
      }
      
      logger.auditLog(
        credential.user_id,
        'verification',
        this.getResourceIdentifier(credential),
        {
          result: verificationResult.success ? 'success' : 'failed',
          credentialType: credential.type
        }
      );
      
      return data;
      
    } catch (error) {
      logger.error('Audit logging failed:', error);
      // Don't throw - audit logging failure shouldn't stop the verification process
      return null;
    }
  }
  
  /**
   * Log credential status update audit event
   * @param {Object} credential - The credential that was updated
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {Object} additionalData - Additional audit data
   * @returns {Promise<Object>} Audit log entry
   */
  async logStatusUpdate(credential, oldStatus, newStatus, additionalData = {}) {
    try {
      const auditEntry = {
        id: uuidv4(),
        user_id: credential.user_id,
        action: 'status_update',
        resource: this.getResourceIdentifier(credential),
        metadata: {
          credential_id: credential.id,
          credential_name: credential.name,
          credential_type: credential.type,
          old_status: oldStatus,
          new_status: newStatus,
          performed_by: 'cpm-system',
          update_timestamp: new Date().toISOString(),
          ...additionalData
        },
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('audit_logs')
        .insert([auditEntry])
        .select()
        .single();
      
      if (error) {
        logger.error('Failed to insert status update audit log:', error);
        throw error;
      }
      
      logger.auditLog(
        credential.user_id,
        'status_update',
        this.getResourceIdentifier(credential),
        {
          oldStatus,
          newStatus,
          credentialType: credential.type
        }
      );
      
      return data;
      
    } catch (error) {
      logger.error('Status update audit logging failed:', error);
      return null;
    }
  }
  
  /**
   * Log CPM system events
   * @param {string} action - The action performed
   * @param {string} resource - The resource affected
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Audit log entry
   */
  async logSystemEvent(action, resource, metadata = {}) {
    try {
      const auditEntry = {
        id: uuidv4(),
        user_id: null, // System events don't have a specific user
        action: `cpm_${action}`,
        resource,
        metadata: {
          performed_by: 'cpm-system',
          event_timestamp: new Date().toISOString(),
          system_event: true,
          ...metadata
        },
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('audit_logs')
        .insert([auditEntry])
        .select()
        .single();
      
      if (error) {
        logger.error('Failed to insert system event audit log:', error);
        throw error;
      }
      
      logger.auditLog(
        'system',
        `cpm_${action}`,
        resource,
        metadata
      );
      
      return data;
      
    } catch (error) {
      logger.error('System event audit logging failed:', error);
      return null;
    }
  }
  
  /**
   * Log batch verification completion
   * @param {Array} results - Array of verification results
   * @returns {Promise<void>}
   */
  async logBatchVerification(results) {
    const summary = {
      total: results.length,
      successful: results.filter(r => r.verificationResult.success).length,
      failed: results.filter(r => r.verificationResult.success === false).length,
      by_type: results.reduce((acc, r) => {
        acc[r.credential.type] = (acc[r.credential.type] || 0) + 1;
        return acc;
      }, {}),
      by_result: results.reduce((acc, r) => {
        const result = r.verificationResult.success ? 'success' : 'failed';
        acc[result] = (acc[result] || 0) + 1;
        return acc;
      }, {}),
      duration: results.reduce((acc, r) => acc + (r.duration || 0), 0),
      start_time: Math.min(...results.map(r => new Date(r.startTime || Date.now()).getTime())),
      end_time: Date.now()
    };
    
    await this.logSystemEvent('batch_verification_completed', 'credentials', {
      batch_summary: summary,
      credential_ids: results.map(r => r.credential.id)
    });
  }
  
  /**
   * Log security events related to credential verification
   * @param {string} event - Security event type
   * @param {string} severity - Event severity (low, medium, high, critical)
   * @param {Object} details - Event details
   * @returns {Promise<Object>} Audit log entry
   */
  async logSecurityEvent(event, severity, details = {}) {
    try {
      const auditEntry = {
        id: uuidv4(),
        user_id: details.user_id || null,
        action: 'security_event',
        resource: details.resource || 'cpm-system',
        metadata: {
          security_event: event,
          severity: severity,
          event_timestamp: new Date().toISOString(),
          performed_by: 'cpm-system',
          ...details
        },
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('audit_logs')
        .insert([auditEntry])
        .select()
        .single();
      
      if (error) {
        logger.error('Failed to insert security event audit log:', error);
        throw error;
      }
      
      logger.securityEvent(event, severity, details);
      
      return data;
      
    } catch (error) {
      logger.error('Security event audit logging failed:', error);
      return null;
    }
  }
  
  /**
   * Get resource identifier for a credential
   * @param {Object} credential - Credential object
   * @returns {string} Resource identifier
   */
  getResourceIdentifier(credential) {
    if (credential.host && credential.username) {
      return `${credential.type}://${credential.username}@${credential.host}`;
    } else if (credential.host) {
      return `${credential.type}://${credential.host}`;
    } else {
      return `${credential.type}:${credential.name}`;
    }
  }
  
  /**
   * Clean up old audit logs (housekeeping)
   * @param {number} retentionDays - Number of days to retain logs
   * @returns {Promise<number>} Number of logs deleted
   */
  async cleanupOldLogs(retentionDays = null) {
    try {
      const retention = retentionDays || this.config.get('metricsRetentionDays');
      const cutoffDate = new Date(Date.now() - (retention * 24 * 60 * 60 * 1000));
      
      const { data, error } = await supabase
        .from('audit_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('id');
      
      if (error) {
        logger.error('Failed to cleanup old audit logs:', error);
        return 0;
      }
      
      const deletedCount = data?.length || 0;
      if (deletedCount > 0) {
        logger.info(`🧹 Cleaned up ${deletedCount} old audit log entries`);
        
        await this.logSystemEvent('audit_cleanup', 'audit_logs', {
          deleted_count: deletedCount,
          retention_days: retention,
          cutoff_date: cutoffDate.toISOString()
        });
      }
      
      return deletedCount;
      
    } catch (error) {
      logger.error('Audit log cleanup failed:', error);
      return 0;
    }
  }
  
  /**
   * Get audit statistics
   * @param {number} days - Number of days to look back
   * @returns {Promise<Object>} Audit statistics
   */
  async getAuditStats(days = 7) {
    try {
      const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      
      const { data, error } = await supabase
        .from('audit_logs')
        .select('action, created_at, metadata')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) {
        logger.error('Failed to get audit stats:', error);
        return null;
      }
      
      const stats = {
        total_events: data.length,
        by_action: data.reduce((acc, log) => {
          acc[log.action] = (acc[log.action] || 0) + 1;
          return acc;
        }, {}),
        verification_results: data
          .filter(log => log.action === 'verification')
          .reduce((acc, log) => {
            const result = log.metadata?.verification_result || 'unknown';
            acc[result] = (acc[result] || 0) + 1;
            return acc;
          }, {}),
        by_day: data.reduce((acc, log) => {
          const day = log.created_at.split('T')[0];
          acc[day] = (acc[day] || 0) + 1;
          return acc;
        }, {}),
        period: {
          start: startDate.toISOString(),
          end: new Date().toISOString(),
          days: days
        }
      };
      
      return stats;
      
    } catch (error) {
      logger.error('Failed to calculate audit stats:', error);
      return null;
    }
  }
}