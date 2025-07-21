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