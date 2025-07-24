import { supabaseAdmin } from '../utils/supabaseClient.js';

/**
 * Helper to perform a count query against a Supabase table.
 * Uses the `head` option so that only the count is returned in the headers.
 */
async function countRows(table, filtersFn = (q) => q) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  query = filtersFn(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function getStats() {
  const [totalCredentials, activeSessions, privilegedUsers] = await Promise.all([
    // total credentials
    countRows('credentials'),
    // active sessions (active = true)
    countRows('sessions', (q) => q.eq('active', true)),
    // privileged users (roles other than "User")
    countRows('profiles', (q) => q.in('role', ['Admin', 'Manager', 'Auditor'])),
  ]);

  // TODO: implement a real compliance scoring algorithm
  const complianceScore = 100;

  return {
    totalCredentials,
    activeSessions,
    privilegedUsers,
    complianceScore,
  };
}

export async function getAlerts({ limit = 10 } = {}) {
  // Fetch most recent critical alerts. Fallback to empty array on missing table.
  try {
    const { data, error } = await supabaseAdmin
      .from('alerts')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  } catch (err) {
    // If the alerts table does not exist yet, return an empty list instead of failing the whole request.
    if (err?.message?.includes('relation') || err?.code === '42P01') {
      return [];
    }
    throw err;
  }
}

export async function getValidationData({ userId, role, range = '24h' }) {
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

    const data = {
      summary: {
        totalAccounts: 0,
        verifiedAccounts: 0,
        failedAccounts: 0,
        pendingAccounts: 0,
        totalCredentials: 0,
        verifiedCredentials: 0,
        failedCredentials: 0,
        activeSessions: 0
      },
      recentActivity: [],
      trends: {
        verificationRate: 0,
        failureRate: 0,
        avgResponseTime: 0
      }
    };

    // Build queries based on user role
    let accountQuery = supabaseAdmin.from('privileged_accounts').select('*', { count: 'exact' });
    let credentialQuery = supabaseAdmin.from('credentials').select('*', { count: 'exact' });
    
    if (role === 'User') {
      accountQuery = accountQuery.eq('owner_id', userId);
      credentialQuery = credentialQuery.eq('user_id', userId);
    }

    // Get account statistics
    try {
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

      data.summary.totalAccounts = totalAccounts.count || 0;
      data.summary.verifiedAccounts = verifiedAccounts.count || 0;
      data.summary.failedAccounts = failedAccounts.count || 0;
      data.summary.pendingAccounts = pendingAccounts.count || 0;
    } catch (err) {
      console.warn('Error fetching account statistics:', err.message);
    }

    // Get credential statistics
    try {
      const [
        totalCredentials,
        verifiedCredentials,
        failedCredentials
      ] = await Promise.all([
        credentialQuery,
        credentialQuery.eq('status', 'verified'),
        credentialQuery.eq('status', 'failed')
      ]);

      data.summary.totalCredentials = totalCredentials.count || 0;
      data.summary.verifiedCredentials = verifiedCredentials.count || 0;
      data.summary.failedCredentials = failedCredentials.count || 0;
    } catch (err) {
      console.warn('Error fetching credential statistics:', err.message);
    }

    // Get JIT sessions count
    try {
      const nowIso = new Date().toISOString();
      let jitQuery = supabaseAdmin
        .from('jit_sessions')
        .select('*', { count: 'exact' })
        .eq('active', true)
        .gt('expires_at', nowIso);
      
      if (role === 'User') {
        jitQuery = jitQuery.eq('user_id', userId);
      }

      const { count } = await jitQuery;
      data.summary.activeSessions = count || 0;
    } catch (err) {
      console.warn('Error fetching JIT session statistics:', err.message);
    }

    // Get recent validation activity from audit logs
    try {
      let auditQuery = supabaseAdmin
        .from('audit_logs')
        .select('*')
        .in('action', ['account_verification', 'jit_account_verification', 'credential_verification'])
        .gte('created_at', startTime.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (role === 'User') {
        auditQuery = auditQuery.eq('user_id', userId);
      }

      const { data: auditData, error: auditError } = await auditQuery;
      
      if (!auditError && auditData) {
        data.recentActivity = auditData.map(log => ({
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
        
        const failedValidations = auditData.filter(log => 
          log.metadata?.verification_status === 'failed' || 
          log.metadata?.verification_status === 'invalid'
        );

        const totalValidations = auditData.length;
        data.trends.verificationRate = totalValidations > 0 ? 
          Math.round((successfulValidations.length / totalValidations) * 100) : 0;
        data.trends.failureRate = totalValidations > 0 ? 
          Math.round((failedValidations.length / totalValidations) * 100) : 0;

        // Calculate average response time
        const durationsWithValues = auditData
          .map(log => log.metadata?.durationMs)
          .filter(duration => duration && duration > 0);
        
        data.trends.avgResponseTime = durationsWithValues.length > 0 ?
          Math.round(durationsWithValues.reduce((sum, duration) => sum + duration, 0) / durationsWithValues.length) : 0;
      }
    } catch (err) {
      console.warn('Error fetching audit logs:', err.message);
    }

    return data;

  } catch (error) {
    console.error('Error getting validation data:', error);
    
    // Return safe default data structure
    return {
      summary: {
        totalAccounts: 0,
        verifiedAccounts: 0,
        failedAccounts: 0,
        pendingAccounts: 0,
        totalCredentials: 0,
        verifiedCredentials: 0,
        failedCredentials: 0,
        activeSessions: 0
      },
      recentActivity: [],
      trends: {
        verificationRate: 0,
        failureRate: 0,
        avgResponseTime: 0
      }
    };
  }
}

export async function getAnalyticsData({ userId, role, range = '24h' }) {
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

    const data = {
      validationTrends: {
        timeRange: range,
        dataPoints: [],
        totalValidations: 0,
        successRate: 0,
        failureRate: 0
      },
      topFailures: [],
      systemPerformance: {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        throughput: 0
      },
      complianceMetrics: {
        accountCompliance: 0,
        credentialCompliance: 0,
        overallScore: 0
      }
    };

    // Get validation trends from audit logs
    try {
      let auditQuery = supabaseAdmin
        .from('audit_logs')
        .select('*')
        .in('action', ['account_verification', 'jit_account_verification', 'credential_verification'])
        .gte('created_at', startTime.toISOString())
        .order('created_at', { ascending: true });

      if (role === 'User') {
        auditQuery = auditQuery.eq('user_id', userId);
      }

      const { data: auditData, error: auditError } = await auditQuery;
      
      if (!auditError && auditData) {
        data.validationTrends.totalValidations = auditData.length;
        
        const successful = auditData.filter(log => 
          log.metadata?.verification_status === 'verified' || 
          log.metadata?.verification_status === 'valid'
        );
        
        data.validationTrends.successRate = auditData.length > 0 ? 
          Math.round((successful.length / auditData.length) * 100) : 0;
        data.validationTrends.failureRate = 100 - data.validationTrends.successRate;

        // Group by hour/day for trend data
        const groupedData = {};
        auditData.forEach(log => {
          const date = new Date(log.created_at);
          const key = range === '1h' ? 
            date.getMinutes() : 
            range === '24h' ? 
              date.getHours() : 
              date.toDateString();
          
          if (!groupedData[key]) {
            groupedData[key] = { successful: 0, failed: 0 };
          }
          
          if (log.metadata?.verification_status === 'verified' || log.metadata?.verification_status === 'valid') {
            groupedData[key].successful++;
          } else {
            groupedData[key].failed++;
          }
        });

        data.validationTrends.dataPoints = Object.entries(groupedData).map(([key, values]) => ({
          time: key,
          successful: values.successful,
          failed: values.failed,
          total: values.successful + values.failed
        }));
      }
    } catch (err) {
      console.warn('Error fetching analytics data:', err.message);
    }

    return data;

  } catch (error) {
    console.error('Error getting analytics data:', error);
    return {
      validationTrends: { timeRange: range, dataPoints: [], totalValidations: 0, successRate: 0, failureRate: 0 },
      topFailures: [],
      systemPerformance: { avgResponseTime: 0, p95ResponseTime: 0, throughput: 0 },
      complianceMetrics: { accountCompliance: 0, credentialCompliance: 0, overallScore: 0 }
    };
  }
}

export async function getJitHealthData({ userId, role, range = '24h' }) {
  try {
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

    const data = {
      activeSessions: 0,
      expiringSessions: 0,
      totalSessionsInRange: 0,
      averageSessionDuration: 0,
      sessionsBySystem: [],
      accountVerificationStatus: {
        verified: 0,
        failed: 0,
        pending: 0
      }
    };

    // Get JIT session statistics
    try {
      const nowIso = new Date().toISOString();
      const expiringSoon = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes from now

      let sessionQuery = supabaseAdmin.from('jit_sessions').select('*');
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

      data.activeSessions = activeSessions.count || 0;
      data.expiringSessions = expiringSessions.count || 0;
      data.totalSessionsInRange = allSessions.count || 0;

      // Group sessions by system
      if (allSessions.data) {
        const systemCounts = {};
        allSessions.data.forEach(session => {
          const system = session.system || 'Unknown';
          systemCounts[system] = (systemCounts[system] || 0) + 1;
        });

        data.sessionsBySystem = Object.entries(systemCounts).map(([system, count]) => ({
          system,
          count
        }));
      }
    } catch (err) {
      console.warn('Error fetching JIT session data:', err.message);
    }

    // Get JIT account verification status
    try {
      let auditQuery = supabaseAdmin
        .from('audit_logs')
        .select('*')
        .eq('action', 'jit_account_verification')
        .gte('created_at', startTime.toISOString());

      if (role === 'User') {
        auditQuery = auditQuery.eq('user_id', userId);
      }

      const { data: jitAuditData, error: jitAuditError } = await auditQuery;
      
      if (!jitAuditError && jitAuditData) {
        jitAuditData.forEach(log => {
          const status = log.metadata?.verification_status;
          if (status === 'verified' || status === 'valid') {
            data.accountVerificationStatus.verified++;
          } else if (status === 'failed' || status === 'invalid') {
            data.accountVerificationStatus.failed++;
          } else {
            data.accountVerificationStatus.pending++;
          }
        });
      }
    } catch (err) {
      console.warn('Error fetching JIT verification data:', err.message);
    }

    return data;

  } catch (error) {
    console.error('Error getting JIT health data:', error);
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

export async function getSystemHealthData({ userId, role, range = '24h' }) {
  try {
    const data = {
      systemOverview: {
        totalSystems: 0,
        healthySystems: 0,
        unhealthySystems: 0,
        unknownSystems: 0
      },
      systemBreakdown: [],
      networkHealth: {
        connectivityScore: 95,
        averageLatency: 0,
        timeoutRate: 0
      },
      securityPosture: {
        compliantSystems: 0,
        nonCompliantSystems: 0,
        criticalAlerts: 0
      }
    };

    // Get system health from privileged accounts
    try {
      let accountQuery = supabaseAdmin
        .from('privileged_accounts')
        .select('system_type, hostname_ip, last_validation_status');

      if (role === 'User') {
        accountQuery = accountQuery.eq('owner_id', userId);
      }

      const { data: accountData, error: accountError } = await accountQuery;
      
      if (!accountError && accountData) {
        const systemStats = {};
        
        accountData.forEach(account => {
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
              data.systemOverview.healthySystems++;
              break;
            case 'invalid':
              systemStats[systemType].failed++;
              data.systemOverview.unhealthySystems++;
              break;
            default:
              systemStats[systemType].pending++;
              data.systemOverview.unknownSystems++;
          }
        });

        data.systemOverview.totalSystems = accountData.length;
        
        data.systemBreakdown = Object.entries(systemStats).map(([type, stats]) => ({
          systemType: type,
          total: stats.total,
          verified: stats.verified,
          failed: stats.failed,
          pending: stats.pending,
          healthScore: stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0
        }));
      }
    } catch (err) {
      console.warn('Error fetching system health data:', err.message);
    }

    return data;

  } catch (error) {
    console.error('Error getting system health data:', error);
    return {
      systemOverview: { totalSystems: 0, healthySystems: 0, unhealthySystems: 0, unknownSystems: 0 },
      systemBreakdown: [],
      networkHealth: { connectivityScore: 95, averageLatency: 0, timeoutRate: 0 },
      securityPosture: { compliantSystems: 0, nonCompliantSystems: 0, criticalAlerts: 0 }
    };
  }
} 