import supabase from '../utils/supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';

const TABLE = 'jit_sessions';

export async function requestJITAccess({ userId, resource, durationMinutes }) {
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  const session = {
    id: uuidv4(),
    user_id: userId,
    resource,
    expires_at: expiresAt,
    active: true,
  };
  const { data, error } = await supabase.from(TABLE).insert([session]).single();
  if (error) throw error;
  return data;
}

export async function listActiveSessions({ userId, role }) {
  let query = supabase.from(TABLE).select('*').eq('active', true);
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
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