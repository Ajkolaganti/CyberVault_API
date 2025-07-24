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