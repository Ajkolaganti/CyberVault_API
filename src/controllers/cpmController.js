/**
 * CPM Controller
 * Handles API endpoints for Central Policy Manager operations
 */

import * as credentialService from '../services/credentialService.js';
import supabaseService from '../utils/supabaseServiceClient.js';
import { logger } from '../cpm/utils/logger.js';

// CPM Status and Metrics
export async function getStatus(req, res, next) {
  try {
    // Get overall CPM statistics
    const { data: credentials, error: credError } = await supabaseService
      .from('credentials')
      .select('id, type, status, verified_at, last_verification_attempt, created_at');
    
    if (credError) {
      throw credError;
    }

    // Calculate statistics
    const stats = {
      total: credentials.length,
      by_status: credentials.reduce((acc, cred) => {
        acc[cred.status || 'pending'] = (acc[cred.status || 'pending'] || 0) + 1;
        return acc;
      }, {}),
      by_type: credentials.reduce((acc, cred) => {
        acc[cred.type] = (acc[cred.type] || 0) + 1;
        return acc;
      }, {}),
      verification_rate: credentials.length > 0 
        ? Math.round((credentials.filter(c => c.status === 'verified').length / credentials.length) * 100)
        : 0,
      last_scan: credentials
        .filter(c => c.last_verification_attempt)
        .sort((a, b) => new Date(b.last_verification_attempt) - new Date(a.last_verification_attempt))[0]?.last_verification_attempt || null
    };

    // Get recent audit events
    const { data: auditLogs, error: auditError } = await supabaseService
      .from('audit_logs')
      .select('action, created_at, metadata')
      .in('action', ['verification', 'cmp_batch_verification_completed', 'cpm_service_started'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (auditError) {
      logger.warn('Failed to fetch audit logs:', auditError);
    }

    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      statistics: stats,
      recent_activity: auditLogs || [],
      service_info: {
        version: '1.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      }
    });

  } catch (error) {
    logger.error('Failed to get CPM status:', error);
    next(error);
  }
}

// Credential Verification Management
export async function triggerVerification(req, res, next) {
  try {
    const { credential_ids, force = false } = req.body;
    
    if (!credential_ids || !Array.isArray(credential_ids)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'credential_ids array is required'
      });
    }

    // Validate user has access to these credentials
    let query = supabaseService
      .from('credentials')
      .select('id, type, name, status, user_id')
      .in('id', credential_ids);

    if (req.user.role === 'User') {
      query = query.eq('user_id', req.user.id);
    }

    const { data: credentials, error } = await query;

    if (error) {
      throw error;
    }

    logger.info(`Manual verification lookup: Found ${credentials?.length || 0} credentials for IDs: ${credential_ids.join(', ')} by user ${req.user.email} (role: ${req.user.role})`);

    if (credentials.length !== credential_ids.length) {
      return res.status(404).json({
        error: 'Resource not found',
        message: 'Some credentials not found or access denied'
      });
    }

    // Update credentials to pending status to trigger verification
    const updateData = {
      status: 'pending',
      last_verification_attempt: null,
      verification_error: null
    };

    const { error: updateError } = await supabaseService
      .from('credentials')
      .update(updateData)
      .in('id', credential_ids);

    if (updateError) {
      throw updateError;
    }

    logger.info(`Updated ${credential_ids.length} credentials to pending status for verification`);

    // Log the manual trigger
    const auditEntries = credentials.map(cred => ({
      user_id: req.user.id,
      action: 'manual_verification_trigger',
      resource: `${cred.type}:${cred.name}`,
      metadata: {
        credential_id: cred.id,
        credential_type: cred.type,
        triggered_by: req.user.email,
        force: force,
        timestamp: new Date().toISOString()
      }
    }));

    await supabaseService.from('audit_logs').insert(auditEntries);

    logger.info(`Manual verification triggered for ${credentials.length} credentials by ${req.user.email}`);

    res.json({
      message: `Verification triggered for ${credentials.length} credentials`,
      credentials: credentials.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: 'pending'
      })),
      estimated_completion: new Date(Date.now() + (credentials.length * 10000)).toISOString() // Rough estimate
    });

  } catch (error) {
    logger.error('Failed to trigger verification:', error);
    next(error);
  }
}

// Get verification history for a credential
export async function getVerificationHistory(req, res, next) {
  try {
    const { credentialId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify user has access to this credential
    let credQuery = supabaseService
      .from('credentials')
      .select('id, name, type, user_id')
      .eq('id', credentialId)
      .single();

    if (req.user.role === 'User') {
      credQuery = credQuery.eq('user_id', req.user.id);
    }

    const { data: credential, error: credError } = await credQuery;

    if (credError || !credential) {
      return res.status(404).json({
        error: 'Resource not found',
        message: 'Credential not found or access denied'
      });
    }

    // Get audit logs for this credential
    const { data: history, error: historyError } = await supabaseService
      .from('audit_logs')
      .select('*')
      .eq('metadata->>credential_id', credentialId)
      .in('action', ['verification', 'status_update', 'manual_verification_trigger'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (historyError) {
      throw historyError;
    }

    // Format history for frontend
    const formattedHistory = history.map(entry => ({
      id: entry.id,
      action: entry.action,
      timestamp: entry.created_at,
      result: entry.metadata?.verification_result || entry.metadata?.new_status,
      message: entry.metadata?.verification_message || null,
      error: entry.metadata?.verification_error || null,
      details: {
        performed_by: entry.metadata?.performed_by || 'system',
        duration: entry.metadata?.verification_details?.connectionTime || null,
        error_category: entry.metadata?.verification_category || null
      }
    }));

    res.json({
      credential: {
        id: credential.id,
        name: credential.name,
        type: credential.type
      },
      history: formattedHistory,
      pagination: {
        offset: parseInt(offset),
        limit: parseInt(limit),
        total: formattedHistory.length
      }
    });

  } catch (error) {
    logger.error('Failed to get verification history:', error);
    next(error);
  }
}

// Get credentials requiring attention
export async function getCredentialsRequiringAttention(req, res, next) {
  try {
    const { type, status } = req.query;

    let query = supabaseService
      .from('credentials')
      .select(`
        id,
        type,
        name,
        status,
        verified_at,
        last_verification_attempt,
        verification_error,
        created_at,
        updated_at
      `);

    // Apply user-level filtering
    if (req.user.role === 'User') {
      query = query.eq('user_id', req.user.id);
    }

    // Apply filters
    if (type) {
      query = query.eq('type', type);
    }

    if (status) {
      query = query.eq('status', status);
    } else {
      // Default: get credentials that need attention
      query = query.or('status.eq.failed,status.eq.pending,verified_at.is.null');
    }

    query = query.order('created_at', { ascending: false });

    const { data: credentials, error } = await query;

    if (error) {
      throw error;
    }

    // Categorize credentials
    const categorized = {
      never_verified: credentials.filter(c => !c.verified_at),
      failed: credentials.filter(c => c.status === 'failed'),
      pending: credentials.filter(c => c.status === 'pending'),
      stale: credentials.filter(c => {
        if (!c.verified_at) return false;
        const daysSinceVerification = (Date.now() - new Date(c.verified_at)) / (1000 * 60 * 60 * 24);
        return daysSinceVerification > 30; // Consider stale after 30 days
      })
    };

    // Add urgency scoring
    const withUrgency = credentials.map(cred => {
      let urgency = 0;
      if (!cred.verified_at) urgency += 10; // Never verified
      if (cred.status === 'failed') urgency += 8; // Failed verification
      if (cred.status === 'pending') urgency += 5; // Pending verification
      
      if (cred.verified_at) {
        const daysSinceVerification = (Date.now() - new Date(cred.verified_at)) / (1000 * 60 * 60 * 24);
        if (daysSinceVerification > 60) urgency += 6; // Very stale
        else if (daysSinceVerification > 30) urgency += 3; // Stale
      }

      return {
        ...cred,
        urgency,
        days_since_verification: cred.verified_at 
          ? Math.floor((Date.now() - new Date(cred.verified_at)) / (1000 * 60 * 60 * 24))
          : null
      };
    });

    res.json({
      summary: {
        total: credentials.length,
        never_verified: categorized.never_verified.length,
        failed: categorized.failed.length,
        pending: categorized.pending.length,
        stale: categorized.stale.length
      },
      credentials: withUrgency.sort((a, b) => b.urgency - a.urgency), // Sort by urgency
      categories: categorized
    });

  } catch (error) {
    logger.error('Failed to get credentials requiring attention:', error);
    next(error);
  }
}

// Batch update credential status (Admin only)
export async function batchUpdateStatus(req, res, next) {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin role required for batch operations'
      });
    }

    const { credential_ids, status, reason } = req.body;

    if (!credential_ids || !Array.isArray(credential_ids)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'credential_ids array is required'
      });
    }

    if (!['pending', 'verified', 'failed', 'expired'].includes(status)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid status value'
      });
    }

    // Get existing credentials
    const { data: credentials, error: fetchError } = await supabaseService
      .from('credentials')
      .select('id, name, type, status')
      .in('id', credential_ids);

    if (fetchError) {
      throw fetchError;
    }

    // Update credentials
    const { error: updateError } = await supabaseService
      .from('credentials')
      .update({
        status: status,
        last_verification_attempt: new Date().toISOString(),
        verification_error: status === 'failed' ? reason : null
      })
      .in('id', credential_ids);

    if (updateError) {
      throw updateError;
    }

    // Log batch update
    const auditEntries = credentials.map(cred => ({
      user_id: req.user.id,
      action: 'batch_status_update',
      resource: `${cred.type}:${cred.name}`,
      metadata: {
        credential_id: cred.id,
        old_status: cred.status,
        new_status: status,
        reason: reason,
        performed_by: req.user.email,
        timestamp: new Date().toISOString()
      }
    }));

    await supabaseService.from('audit_logs').insert(auditEntries);

    logger.info(`Batch status update: ${credentials.length} credentials set to ${status} by ${req.user.email}`);

    res.json({
      message: `Updated ${credentials.length} credentials to ${status}`,
      updated_credentials: credentials.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        old_status: c.status,
        new_status: status
      }))
    });

  } catch (error) {
    logger.error('Failed to batch update status:', error);
    next(error);
  }
}

// Get CPM configuration (Admin only)
export async function getConfiguration(req, res, next) {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin role required'
      });
    }

    const config = {
      scanning: {
        interval: parseInt(process.env.CPM_SCAN_INTERVAL) || 30000,
        batch_size: parseInt(process.env.CPM_BATCH_SIZE) || 10,
        max_concurrent: parseInt(process.env.CPM_MAX_CONCURRENT) || 5
      },
      timeouts: {
        verification: parseInt(process.env.CPM_VERIFICATION_TIMEOUT) || 30000,
        ssh: parseInt(process.env.CPM_SSH_TIMEOUT) || 15000,
        api: parseInt(process.env.CPM_API_TIMEOUT) || 10000
      },
      features: {
        ssh_verification: process.env.CPM_ENABLE_SSH !== 'false',
        api_verification: process.env.CPM_ENABLE_API !== 'false',
        cert_verification: process.env.CPM_ENABLE_CERT === 'true',
        db_verification: process.env.CPM_ENABLE_DB === 'true'
      },
      retry: {
        max_retries: parseInt(process.env.CPM_MAX_RETRIES) || 3,
        retry_delay: parseInt(process.env.CPM_RETRY_DELAY) || 5000,
        exponential_backoff: process.env.CPM_EXPONENTIAL_BACKOFF !== 'false'
      },
      logging: {
        level: process.env.CPM_LOG_LEVEL || 'info',
        to_file: process.env.CPM_LOG_TO_FILE === 'true',
        file_path: process.env.CPM_LOG_FILE || './logs/cpm.log'
      }
    };

    res.json({
      configuration: config,
      environment: process.env.NODE_ENV || 'development',
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get CPM configuration:', error);
    next(error);
  }
}