import supabase from '../utils/supabaseClient.js';

const TABLE = 'accounts';

export async function listAccounts({ source, userId, role }) {
  let query = supabase.from(TABLE).select('*');
  if (source) {
    query = query.eq('source', source);
  }
  if (role === 'User') {
    // Users only see accounts they own/reference
    query = query.eq('owner_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getAccountById({ id, userId, role }) {
  let query = supabase.from(TABLE).select('*').eq('id', id).single();
  if (role === 'User') {
    query = query.eq('owner_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
} 