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
  // Join with auth.users to get email/username information
  let query = supabase
    .from(TABLE)
    .select(`
      *,
      profiles!jit_sessions_user_id_fkey(
        id,
        role
      )
    `)
    .eq('active', true);
    
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // Get user emails from auth.users for each session
  if (data && data.length > 0) {
    const userIds = [...new Set(data.map(session => session.user_id))];
    
    // Query auth.users to get email information
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) {
      console.warn('Could not fetch user emails:', authError);
      return data; // Return original data if auth query fails
    }
    
    // Create a map of user_id to email
    const userEmailMap = {};
    authUsers.users.forEach(user => {
      userEmailMap[user.id] = user.email;
    });
    
    // Add username (email) to each session
    return data.map(session => ({
      ...session,
      username: userEmailMap[session.user_id] || 'Unknown User'
    }));
  }
  
  return data;
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