import supabase, { supabaseAdmin } from '../utils/supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';

const TABLE = 'jit_sessions';

export async function requestJITAccess({ userId, resource, system, reason, durationMinutes }) {
  // Validate required fields
  if (!reason || reason.trim() === '') {
    throw new Error('Business justification reason is required and cannot be empty');
  }
  
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  const session = {
    id: uuidv4(),
    user_id: userId,
    resource,
    system,
    business_justification: reason.trim(),
    expires_at: expiresAt,
    active: true,
  };
  const { data, error } = await supabase.from(TABLE).insert([session]).single();
  if (error) throw error;
  return data;
}

export async function listActiveSessions({ userId, role }) {
  console.log(`Fetching active JIT sessions for userId: ${userId}, role: ${role}`);
  
  // First, cleanup expired sessions in real-time
  await cleanupExpiredSessions();
  
  const nowIso = new Date().toISOString();
  
  let query = supabase
    .from(TABLE)
    .select(`
      *,
      profiles!jit_sessions_user_id_fkey(
        id,
        role
      )
    `)
    .eq('active', true)
    .gt('expires_at', nowIso); // Only truly active (not expired) sessions
    
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return await enrichSessionsWithUserData(data || []);
}

export async function listSessionHistory({ userId, role, limit = 50, offset = 0 }) {
  console.log(`Fetching JIT session history for userId: ${userId}, role: ${role}`);
  
  let query = supabase
    .from(TABLE)
    .select(`
      *,
      profiles!jit_sessions_user_id_fkey(
        id,
        role
      )
    `)
    .eq('active', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
    
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return await enrichSessionsWithUserData(data || []);
}

export async function getAllSessions({ userId, role, status = 'all', limit = 50, offset = 0 }) {
  console.log(`Fetching all JIT sessions for userId: ${userId}, role: ${role}, status: ${status}`);
  
  // Cleanup expired sessions first
  await cleanupExpiredSessions();
  
  const nowIso = new Date().toISOString();
  
  let query = supabase
    .from(TABLE)
    .select(`
      *,
      profiles!jit_sessions_user_id_fkey(
        id,
        role
      )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  // Apply status filter
  if (status === 'active') {
    query = query.eq('active', true).gt('expires_at', nowIso);
  } else if (status === 'expired') {
    query = query.eq('active', false);
  } else if (status === 'expiring_soon') {
    const soonThreshold = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
    query = query.eq('active', true).gt('expires_at', nowIso).lt('expires_at', soonThreshold);
  }
  // status === 'all' means no additional filter
    
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return await enrichSessionsWithUserData(data || []);
}

// Helper function to enrich sessions with user data
async function enrichSessionsWithUserData(sessions) {
  if (!sessions || sessions.length === 0) {
    return [];
  }
  
  try {
    const userIds = [...new Set(sessions.map(session => session.user_id))];
    
    // Query auth.users to get email information
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) {
      console.warn('Could not fetch user emails:', authError);
      return sessions; // Return original data if auth query fails
    }
    
    // Create a map of user_id to email
    const userEmailMap = {};
    authUsers.users.forEach(user => {
      userEmailMap[user.id] = user.email;
    });
    
    const nowIso = new Date().toISOString();
    
    // Add username and computed status to each session
    return sessions.map(session => {
      const isExpired = new Date(session.expires_at) <= new Date(nowIso);
      const isExpiringSoon = !isExpired && new Date(session.expires_at) <= new Date(Date.now() + 30 * 60 * 1000);
      
      return {
        ...session,
        username: userEmailMap[session.user_id] || 'Unknown User',
        computed_status: isExpired ? 'expired' : (isExpiringSoon ? 'expiring_soon' : 'active'),
        time_remaining: isExpired ? 0 : Math.max(0, new Date(session.expires_at) - new Date(nowIso))
      };
    });
  } catch (error) {
    console.error('Error enriching sessions with user data:', error);
    return sessions;
  }
}
export async function revokeSession({ id, userId, role }) {
  let query = supabase.from(TABLE).update({ active: false }).eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function cleanupExpiredSessions() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ active: false })
    .lt('expires_at', nowIso)
    .eq('active', true);
  if (error) throw error;
  return data;
}

export async function getJITStatistics() {
  try {
    const nowIso = new Date().toISOString();
    
    // Get various counts
    const [activeResult, expiredResult, totalResult, expiringSoonResult] = await Promise.all([
      // Active sessions
      supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('active', true)
        .gt('expires_at', nowIso),
      
      // Expired sessions
      supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('active', false),
      
      // Total sessions
      supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true }),
      
      // Sessions expiring within 30 minutes
      supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('active', true)
        .gt('expires_at', nowIso)
        .lt('expires_at', new Date(Date.now() + 30 * 60 * 1000).toISOString())
    ]);
    
    return {
      active: activeResult.count || 0,
      expired: expiredResult.count || 0,
      total: totalResult.count || 0,
      expiring_soon: expiringSoonResult.count || 0,
      last_updated: nowIso
    };
  } catch (error) {
    console.error('Error getting JIT statistics:', error);
    throw error;
  }
}

export async function extendSession({ id, userId, role, additionalMinutes }) {
  // Validate session exists and user has permission
  let selectQuery = supabase.from(TABLE).select('*').eq('id', id).eq('active', true).single();
  if (role === 'User') {
    selectQuery = selectQuery.eq('user_id', userId);
  }
  
  const { data: session, error: selectError } = await selectQuery;
  if (selectError) throw selectError;
  if (!session) throw new Error('Session not found or not active');
  
  // Check if session is already expired
  const now = new Date();
  const currentExpiry = new Date(session.expires_at);
  if (currentExpiry <= now) {
    throw new Error('Cannot extend expired session');
  }
  
  // Calculate new expiry time
  const newExpiryTime = new Date(currentExpiry.getTime() + additionalMinutes * 60 * 1000);
  
  // Update session
  let updateQuery = supabase
    .from(TABLE)
    .update({ expires_at: newExpiryTime.toISOString() })
    .eq('id', id)
    .single();
  
  if (role === 'User') {
    updateQuery = updateQuery.eq('user_id', userId);
  }
  
  const { data, error } = await updateQuery;
  if (error) throw error;
  
  return data;
}

export async function getSessionById({ id, userId, role }) {
  let query = supabase.from(TABLE).select('*').eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // Enrich with user data
  const enrichedData = await enrichSessionsWithUserData([data]);
  return enrichedData[0];
}
