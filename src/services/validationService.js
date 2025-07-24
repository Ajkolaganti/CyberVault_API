import supabase from '../utils/supabaseClient.js';

export async function getValidationStatistics(userId, userRole) {
  try {
    const stats = {
      accounts: {
        total: 0,
        verified: 0,
        failed: 0,
        pending: 0
      },
      credentials: {
        total: 0,
        verified: 0,
        failed: 0,
        pending: 0
      },
      jitSessions: {
        active: 0,
        expiring: 0,
        total: 0
      },
      recentActivity: []
    };

    // Build queries based on user role
    let accountQuery = supabase.from('privileged_accounts').select('last_validation_status', { count: 'exact' });
    let credentialQuery = supabase.from('credentials').select('status', { count: 'exact' });
    
    if (userRole === 'User') {
      accountQuery = accountQuery.eq('owner_id', userId);
      credentialQuery = credentialQuery.eq('user_id', userId);
    }

    // Get account statistics
    const [
      totalAccounts,
      verifiedAccounts,
      failedAccounts,
      pendingAccounts
    ] = await Promise.all([
      accountQuery,
      accountQuery.eq('last_validation_status', 'valid'),
      accountQuery.eq('last_validation_status', 'invalid'),
      accountQuery.or('last_validation_status.is.null,last_validation_status.eq.pending')
    ]);

    stats.accounts = {
      total: totalAccounts.count || 0,
      verified: verifiedAccounts.count || 0,
      failed: failedAccounts.count || 0,
      pending: pendingAccounts.count || 0
    };

    // Get credential statistics
    const [
      totalCredentials,
      verifiedCredentials,
      failedCredentials,
      pendingCredentials
    ] = await Promise.all([
      credentialQuery,
      credentialQuery.eq('status', 'verified'),
      credentialQuery.eq('status', 'failed'),
      credentialQuery.or('status.is.null,status.eq.pending')
    ]);

    stats.credentials = {
      total: totalCredentials.count || 0,
      verified: verifiedCredentials.count || 0,
      failed: failedCredentials.count || 0,
      pending: pendingCredentials.count || 0
    };

    // Get JIT session statistics
    const now = new Date().toISOString();
    const expiringSoon = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes from now

    let jitQuery = supabase.from('jit_sessions').select('*', { count: 'exact' });
    if (userRole === 'User') {
      jitQuery = jitQuery.eq('user_id', userId);
    }

    const [
      totalJitSessions,
      activeJitSessions,
      expiringJitSessions
    ] = await Promise.all([
      jitQuery,
      jitQuery.eq('active', true).gt('expires_at', now),
      jitQuery.eq('active', true).gt('expires_at', now).lt('expires_at', expiringSoon)
    ]);

    stats.jitSessions = {
      total: totalJitSessions.count || 0,
      active: activeJitSessions.count || 0,
      expiring: expiringJitSessions.count || 0
    };

    return stats;

  } catch (error) {
    console.error('Error getting validation statistics:', error);
    // Return default stats on error
    return {
      accounts: { total: 0, verified: 0, failed: 0, pending: 0 },
      credentials: { total: 0, verified: 0, failed: 0, pending: 0 },
      jitSessions: { total: 0, active: 0, expiring: 0 },
      recentActivity: []
    };
  }
}

export async function getRecentValidations({ userId, role, limit = 20, offset = 0 }) {
  try {
    // Get recent validation activities from audit logs
    let query = supabase
      .from('audit_logs')
      .select('*')
      .in('action', ['account_verification', 'jit_account_verification', 'credential_verification'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role === 'User') {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting recent validations:', error);
    return [];
  }
}

export async function getResourceValidationStatus({ resourceType, resourceId, userId, role }) {
  try {
    let query;
    let table;

    switch (resourceType) {
      case 'account':
        table = 'privileged_accounts';
        query = supabase
          .from(table)
          .select('id, last_validation_status, last_validated_at, validation_message')
          .eq('id', resourceId);
        
        if (role === 'User') {
          query = query.eq('owner_id', userId);
        }
        break;

      case 'credential':
        table = 'credentials';
        query = supabase
          .from(table)
          .select('id, status, last_verification_attempt, verification_error')
          .eq('id', resourceId);
        
        if (role === 'User') {
          query = query.eq('user_id', userId);
        }
        break;

      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    const { data, error } = await query.single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Resource not found or access denied');
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error getting resource validation status:', error);
    throw error;
  }
}

export async function getJitHealthStatus({ userId, role, range = '24h' }) {
  try {
    // Calculate time range
    const now = new Date();
    let startTime;
    
    switch (range) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const healthData = {
      activeSessions: 0,
      expiringSessions: 0,
      totalSessionsInRange: 0,
      averageSessionDuration: 0,
      sessionsBySystem: [],
      accountVerificationStatus: {
        verified: 0,
        failed: 0,
        pending: 0
      },
      alertCriteria: {
        expiringSoonThreshold: 30, // minutes
        longRunningSessionThreshold: 480 // 8 hours
      }
    };

    // Get JIT session statistics
    const nowIso = new Date().toISOString();
    const expiringSoon = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes from now

    let sessionQuery = supabase.from('jit_sessions').select('*');
    if (role === 'User') {
      sessionQuery = sessionQuery.eq('user_id', userId);
    }

    const [
      activeSessions,
      expiringSessions,
      allSessions
    ] = await Promise.all([
      sessionQuery.eq('active', true).gt('expires_at', nowIso),
      sessionQuery.eq('active', true).gt('expires_at', nowIso).lt('expires_at', expiringSoon),
      sessionQuery.gte('created_at', startTime.toISOString())
    ]);

    healthData.activeSessions = activeSessions.data?.length || 0;
    healthData.expiringSessions = expiringSessions.data?.length || 0;
    healthData.totalSessionsInRange = allSessions.data?.length || 0;

    // Group sessions by system
    if (allSessions.data) {
      const systemCounts = {};
      allSessions.data.forEach(session => {
        const system = session.system || 'Unknown';
        systemCounts[system] = (systemCounts[system] || 0) + 1;
      });

      healthData.sessionsBySystem = Object.entries(systemCounts).map(([system, count]) => ({
        system,
        count
      }));
    }

    return healthData;

  } catch (error) {
    console.error('Error getting JIT health status:', error);
    return {
      activeSessions: 0,
      expiringSessions: 0,
      totalSessionsInRange: 0,
      averageSessionDuration: 0,
      sessionsBySystem: [],
      accountVerificationStatus: { verified: 0, failed: 0, pending: 0 }
    };
  }
}

export async function getAccountsValidationStatus({ userId, role, range = '24h' }) {
  try {
    // Calculate time range
    const now = new Date();
    let startTime;
    
    switch (range) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const accountStatus = {
      summary: {
        totalAccounts: 0,
        verifiedAccounts: 0,
        failedAccounts: 0,
        pendingAccounts: 0,
        verificationRate: 0
      },
      recentValidations: [],
      systemBreakdown: [],
      trends: {
        validationsInPeriod: 0,
        successRate: 0,
        failureRate: 0,
        averageResponseTime: 0
      }
    };

    // Get account statistics
    let accountQuery = supabase.from('privileged_accounts').select('*', { count: 'exact' });
    if (role === 'User') {
      accountQuery = accountQuery.eq('owner_id', userId);
    }

    const [
      totalAccounts,
      verifiedAccounts,
      failedAccounts,
      pendingAccounts
    ] = await Promise.all([
      accountQuery,
      accountQuery.eq('last_validation_status', 'valid'),
      accountQuery.eq('last_validation_status', 'invalid'),
      accountQuery.or('last_validation_status.is.null,last_validation_status.eq.pending')
    ]);

    accountStatus.summary = {
      totalAccounts: totalAccounts.count || 0,
      verifiedAccounts: verifiedAccounts.count || 0,
      failedAccounts: failedAccounts.count || 0,
      pendingAccounts: pendingAccounts.count || 0,
      verificationRate: totalAccounts.count > 0 ? 
        Math.round((verifiedAccounts.count / totalAccounts.count) * 100) : 0
    };

    // Get recent validation activities from audit logs
    let auditQuery = supabase
      .from('audit_logs')
      .select('*')
      .in('action', ['account_verification', 'jit_account_verification'])
      .gte('created_at', startTime.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (role === 'User') {
      auditQuery = auditQuery.eq('user_id', userId);
    }

    const { data: auditData, error: auditError } = await auditQuery;
    
    if (!auditError && auditData) {
      accountStatus.recentValidations = auditData.map(log => ({
        id: log.id,
        timestamp: log.created_at,
        action: log.action,
        resource: log.resource,
        status: log.metadata?.verification_status || 'unknown',
        message: log.metadata?.verification_message || 'No details',
        duration: log.metadata?.durationMs || 0
      }));

      // Calculate trends
      const successfulValidations = auditData.filter(log => 
        log.metadata?.verification_status === 'verified' || 
        log.metadata?.verification_status === 'valid'
      );
      
      accountStatus.trends.validationsInPeriod = auditData.length;
      accountStatus.trends.successRate = auditData.length > 0 ? 
        Math.round((successfulValidations.length / auditData.length) * 100) : 0;
      accountStatus.trends.failureRate = 100 - accountStatus.trends.successRate;
    }

    return accountStatus;

  } catch (error) {
    console.error('Error getting accounts validation status:', error);
    return {
      summary: { totalAccounts: 0, verifiedAccounts: 0, failedAccounts: 0, pendingAccounts: 0, verificationRate: 0 },
      recentValidations: [],
      systemBreakdown: [],
      trends: { validationsInPeriod: 0, successRate: 0, failureRate: 0, averageResponseTime: 0 }
    };
  }
}

export async function getAccountsValidationStatistics({ userId, role, range = '24h' }) {
  try {
    // Calculate time range
    const now = new Date();
    let startTime;
    
    switch (range) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const statistics = {
      summary: {
        totalAccounts: 0,
        verifiedAccounts: 0,
        failedAccounts: 0,
        pendingAccounts: 0,
        verificationRate: 0,
        lastValidation: null
      },
      performance: {
        averageValidationTime: 0,
        successRate: 0,
        failureRate: 0,
        validationsInPeriod: 0
      },
      systemBreakdown: [],
      alertsAndIssues: {
        expiredCredentials: 0,
        failedConsecutiveAttempts: 0,
        unreachableSystems: 0
      }
    };

    // Get account statistics
    let accountQuery = supabase.from('privileged_accounts').select('*', { count: 'exact' });
    if (role === 'User') {
      accountQuery = accountQuery.eq('owner_id', userId);
    }

    const [
      totalAccounts,
      verifiedAccounts,
      failedAccounts,
      pendingAccounts
    ] = await Promise.all([
      accountQuery,
      accountQuery.eq('last_validation_status', 'valid'),
      accountQuery.eq('last_validation_status', 'invalid'),
      accountQuery.or('last_validation_status.is.null,last_validation_status.eq.pending')
    ]);

    statistics.summary = {
      totalAccounts: totalAccounts.count || 0,
      verifiedAccounts: verifiedAccounts.count || 0,
      failedAccounts: failedAccounts.count || 0,
      pendingAccounts: pendingAccounts.count || 0,
      verificationRate: totalAccounts.count > 0 ? 
        Math.round((verifiedAccounts.count / totalAccounts.count) * 100) : 0
    };

    // Get validation performance from audit logs
    let auditQuery = supabase
      .from('audit_logs')
      .select('*')
      .in('action', ['account_verification', 'jit_account_verification'])
      .gte('created_at', startTime.toISOString())
      .order('created_at', { ascending: false });

    if (role === 'User') {
      auditQuery = auditQuery.eq('user_id', userId);
    }

    const { data: auditData, error: auditError } = await auditQuery;
    
    if (!auditError && auditData) {
      const successfulValidations = auditData.filter(log => 
        log.metadata?.verification_status === 'verified' || 
        log.metadata?.verification_status === 'valid'
      );
      
      statistics.performance = {
        validationsInPeriod: auditData.length,
        successRate: auditData.length > 0 ? 
          Math.round((successfulValidations.length / auditData.length) * 100) : 0,
        failureRate: auditData.length > 0 ? 
          Math.round(((auditData.length - successfulValidations.length) / auditData.length) * 100) : 0,
        averageValidationTime: auditData.length > 0 ? 
          Math.round(auditData.reduce((sum, log) => sum + (log.metadata?.durationMs || 0), 0) / auditData.length) : 0
      };

      // Get latest validation timestamp
      if (auditData.length > 0) {
        statistics.summary.lastValidation = auditData[0].created_at;
      }
    }

    // Get system breakdown from accounts
    if (totalAccounts.data) {
      const systemStats = {};
      totalAccounts.data.forEach(account => {
        const systemType = account.system_type || 'Unknown';
        if (!systemStats[systemType]) {
          systemStats[systemType] = {
            total: 0,
            verified: 0,
            failed: 0,
            pending: 0
          };
        }
        
        systemStats[systemType].total++;
        
        switch (account.last_validation_status) {
          case 'valid':
            systemStats[systemType].verified++;
            break;
          case 'invalid':
            systemStats[systemType].failed++;
            break;
          default:
            systemStats[systemType].pending++;
        }
      });

      statistics.systemBreakdown = Object.entries(systemStats).map(([type, stats]) => ({
        systemType: type,
        total: stats.total,
        verified: stats.verified,
        failed: stats.failed,
        pending: stats.pending,
        successRate: stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0
      }));
    }

    return statistics;

  } catch (error) {
    console.error('Error getting accounts validation statistics:', error);
    return {
      summary: { totalAccounts: 0, verifiedAccounts: 0, failedAccounts: 0, pendingAccounts: 0, verificationRate: 0, lastValidation: null },
      performance: { averageValidationTime: 0, successRate: 0, failureRate: 0, validationsInPeriod: 0 },
      systemBreakdown: [],
      alertsAndIssues: { expiredCredentials: 0, failedConsecutiveAttempts: 0, unreachableSystems: 0 }
    };
  }
}

export async function getAccountsValidationHistory({ userId, role, limit = 50, offset = 0, range = '7d' }) {
  try {
    // Calculate time range
    const now = new Date();
    let startTime;
    
    switch (range) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get validation history from audit logs
    let auditQuery = supabase
      .from('audit_logs')
      .select('*')
      .in('action', ['account_verification', 'jit_account_verification'])
      .gte('created_at', startTime.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role === 'User') {
      auditQuery = auditQuery.eq('user_id', userId);
    }

    const { data: auditData, error: auditError } = await auditQuery;
    
    if (auditError) {
      throw auditError;
    }

    const history = (auditData || []).map(log => ({
      id: log.id,
      timestamp: log.created_at,
      action: log.action,
      resource: log.resource,
      resourceType: log.metadata?.resource_type || 'account',
      status: log.metadata?.verification_status || 'unknown',
      message: log.metadata?.verification_message || log.metadata?.message || 'No details available',
      duration: log.metadata?.durationMs || 0,
      systemType: log.metadata?.system_type || 'Unknown',
      hostname: log.metadata?.hostname || log.metadata?.target || 'Unknown',
      username: log.metadata?.username || log.metadata?.target_username || 'Unknown',
      errorDetails: log.metadata?.error_details || null,
      userId: log.user_id,
      success: log.metadata?.verification_status === 'verified' || log.metadata?.verification_status === 'valid'
    }));

    return history;

  } catch (error) {
    console.error('Error getting accounts validation history:', error);
    return [];
  }
}

export async function getAccountsValidationFailures({ userId, role, limit = 50, range = '24h' }) {
  try {
    // Calculate time range
    const now = new Date();
    let startTime;
    
    switch (range) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get failed validations from audit logs
    let auditQuery = supabase
      .from('audit_logs')
      .select('*')
      .in('action', ['account_verification', 'jit_account_verification'])
      .gte('created_at', startTime.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (role === 'User') {
      auditQuery = auditQuery.eq('user_id', userId);
    }

    const { data: auditData, error: auditError } = await auditQuery;
    
    if (auditError) {
      throw auditError;
    }

    // Filter for failed validations only
    const failures = (auditData || [])
      .filter(log => 
        log.metadata?.verification_status === 'failed' || 
        log.metadata?.verification_status === 'invalid' ||
        log.metadata?.verification_status === 'error'
      )
      .map(log => ({
        id: log.id,
        timestamp: log.created_at,
        action: log.action,
        resource: log.resource,
        resourceType: log.metadata?.resource_type || 'account',
        errorType: log.metadata?.error_type || 'unknown',
        errorMessage: log.metadata?.verification_message || log.metadata?.error_message || 'Unknown error',
        errorDetails: log.metadata?.error_details || null,
        systemType: log.metadata?.system_type || 'Unknown',
        hostname: log.metadata?.hostname || log.metadata?.target || 'Unknown',
        username: log.metadata?.username || log.metadata?.target_username || 'Unknown',
        duration: log.metadata?.durationMs || 0,
        retryable: log.metadata?.retryable !== false,
        severity: log.metadata?.severity || 'medium',
        userId: log.user_id,
        suggestions: log.metadata?.suggestions || []
      }));

    // Group failures by error type for analysis
    const failureAnalysis = {
      totalFailures: failures.length,
      byErrorType: {},
      bySystem: {},
      criticalFailures: failures.filter(f => f.severity === 'high').length,
      retryableFailures: failures.filter(f => f.retryable).length
    };

    failures.forEach(failure => {
      // Group by error type
      const errorType = failure.errorType;
      if (!failureAnalysis.byErrorType[errorType]) {
        failureAnalysis.byErrorType[errorType] = 0;
      }
      failureAnalysis.byErrorType[errorType]++;

      // Group by system
      const systemType = failure.systemType;
      if (!failureAnalysis.bySystem[systemType]) {
        failureAnalysis.bySystem[systemType] = 0;
      }
      failureAnalysis.bySystem[systemType]++;
    });

    return {
      failures,
      analysis: failureAnalysis
    };

  } catch (error) {
    console.error('Error getting accounts validation failures:', error);
    return {
      failures: [],
      analysis: {
        totalFailures: 0,
        byErrorType: {},
        bySystem: {},
        criticalFailures: 0,
        retryableFailures: 0
      }
    };
  }
}