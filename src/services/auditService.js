import supabase from '../utils/supabaseClient.js';

const TABLE = 'audit_logs';

export async function logAction({ userId, action, resource, metadata = {} }) {
  const entry = {
    user_id: userId,
    action,
    resource,
    metadata,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(TABLE).insert([entry]);
  if (error) throw error;
}

export async function listLogs({ limit = 100, userId, role }) {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
} 