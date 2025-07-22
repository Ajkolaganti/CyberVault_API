import supabase, { supabaseAdmin } from '../utils/supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';

const SAFES_TABLE = 'safes';
const PERMISSIONS_TABLE = 'safe_permissions';
const ACTIVITY_LOG_TABLE = 'safe_activity_log';

export async function createSafe({ name, description, ownerId, safe_type, access_level, settings }) {
  const safe = {
    id: uuidv4(),
    name,
    description,
    owner_id: ownerId,
    safe_type,
    access_level,
    settings,
    status: 'active',
    created_at: new Date()
  };

  const { data, error } = await supabase
    .from(SAFES_TABLE)
    .insert([safe])
    .single();

  if (error) throw error;
  return data;
}

export async function listSafes({ ownerId, role, safe_type, access_level, status, limit = 50, offset = 0 }) {
  console.log(`Fetching safes for ownerId: ${ownerId}, role: ${role}`);
  
  // Simplified query without the problematic relationship to avoid infinite recursion
  let query = supabase
    .from(SAFES_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }
  
  // Apply filters
  if (safe_type) {
    query = query.eq('safe_type', safe_type);
  }
  
  if (access_level) {
    query = query.eq('access_level', access_level);
  }
  
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;

  console.log(`Found ${data ? data.length : 0} safes`);
  
  return await enrichSafesWithUserData(data || []);
}

// Helper function to enrich safes with user data and account counts
async function enrichSafesWithUserData(safes) {
  if (!safes || safes.length === 0) {
    return [];
  }
  
  try {
    const ownerIds = [...new Set(safes.map(safe => safe.owner_id))];
    const safeIds = safes.map(safe => safe.id);
    
    // Get user emails
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) {
      console.warn('Could not fetch user emails:', authError);
    }
    
    // Get account counts for each safe
    const { data: accountCounts, error: countError } = await supabase
      .from('privileged_accounts')
      .select('safe_id')
      .in('safe_id', safeIds);
    
    if (countError) {
      console.warn('Could not fetch account counts:', countError);
    }
    
    // Create user email map
    const userEmailMap = {};
    if (authUsers) {
      authUsers.users.forEach(user => {
        userEmailMap[user.id] = user.email;
      });
    }
    
    // Create account count map
    const accountCountMap = {};
    if (accountCounts) {
      accountCounts.forEach(account => {
        if (account.safe_id) {
          accountCountMap[account.safe_id] = (accountCountMap[account.safe_id] || 0) + 1;
        }
      });
    }
    
    return safes.map(safe => ({
      ...safe,
      owner_email: userEmailMap[safe.owner_id] || 'Unknown User',
      account_count: accountCountMap[safe.id] || 0,
      permission_count: 0 // TODO: Fetch permissions separately if needed
    }));
  } catch (error) {
    console.error('Error enriching safes with user data:', error);
    return safes;
  }
}

export async function getSafeById({ id, ownerId, role }) {
  let query = supabase.from(SAFES_TABLE).select('*').eq('id', id).single();

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data;
}

export async function updateSafe({ id, ownerId, role, updates }) {
  let query = supabase
    .from(SAFES_TABLE)
    .update(updates)
    .eq('id', id)
    .single();

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function deleteSafe({ id, ownerId, role }) {
  let query = supabase.from(SAFES_TABLE).delete().eq('id', id).single();

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function grantPermission({ safeId, userId, permission_level, granted_by }) {
  const permission = {
    id: uuidv4(),
    safe_id: safeId,
    user_id: userId,
    permission_level,
    granted_by,
    granted_at: new Date()
  };

  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .insert([permission])
    .single();

  if (error) throw error;
  return data;
}

export async function logActivity({ safeId, userId, action, details, ip_address, user_agent }) {
  const entry = {
    id: uuidv4(),
    safe_id: safeId,
    user_id: userId,
    action,
    details,
    ip_address,
    user_agent,
    created_at: new Date()
  };

  const { data, error } = await supabase
    .from(ACTIVITY_LOG_TABLE)
    .insert([entry])
    .single();

  if (error) throw error;
  return data;
}

export async function listActivityLog(safeId) {
  const { data, error } = await supabase
    .from(ACTIVITY_LOG_TABLE)
    .select('*')
    .eq('safe_id', safeId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function listSafePermissions(safeId) {
  const { data, error } = await supabase
    .from(PERMISSIONS_TABLE)
    .select(`
      *,
      profiles!safe_permissions_user_id_fkey(
        id,
        role
      )
    `)
    .eq('safe_id', safeId)
    .order('granted_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function revokePermission({ permissionId, ownerId, role }) {
  let query = supabase.from(PERMISSIONS_TABLE).delete().eq('id', permissionId);
  
  // Only allow owners, admins, or the user themselves to revoke permissions
  if (role !== 'Admin' && role !== 'Manager') {
    query = query.in('safe_id', 
      supabase.from(SAFES_TABLE).select('id').eq('owner_id', ownerId)
    );
  }
  
  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

export async function getSafeStatistics({ ownerId, role }) {
  try {
    let baseQuery = supabase.from(SAFES_TABLE);
    
    if (role === 'User') {
      baseQuery = baseQuery.select().eq('owner_id', ownerId);
    }
    
    const [totalResult, activeResult, sharedResult, typeDistResult] = await Promise.all([
      // Total safes
      baseQuery.select('id', { count: 'exact', head: true }),
      
      // Active safes
      baseQuery.select('id', { count: 'exact', head: true }).eq('status', 'active'),
      
      // Shared safes
      baseQuery.select('id', { count: 'exact', head: true }).neq('access_level', 'private'),
      
      // Type distribution
      baseQuery.select('safe_type')
    ]);
    
    // Count by safe type
    const typeCounts = {};
    typeDistResult.data?.forEach(safe => {
      typeCounts[safe.safe_type] = (typeCounts[safe.safe_type] || 0) + 1;
    });
    
    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      shared: sharedResult.count || 0,
      type_distribution: typeCounts,
      last_updated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting safe statistics:', error);
    throw error;
  }
}

export async function getSafeAccounts(safeId, { ownerId, role }) {
  // First verify user has access to the safe
  const safe = await getSafeById({ id: safeId, ownerId, role });
  if (!safe) {
    throw new Error('Safe not found or access denied');
  }
  
  // Get accounts in this safe
  let query = supabase
    .from('privileged_accounts')
    .select('*')
    .eq('safe_id', safeId);
    
  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return data || [];
}

export async function moveSafeAccounts({ sourceId, targetId, accountIds, ownerId, role }) {
  // Verify user has access to both safes
  const [sourceSafe, targetSafe] = await Promise.all([
    getSafeById({ id: sourceId, ownerId, role }),
    getSafeById({ id: targetId, ownerId, role })
  ]);
  
  if (!sourceSafe || !targetSafe) {
    throw new Error('One or both safes not found or access denied');
  }
  
  // Move accounts
  let query = supabase
    .from('privileged_accounts')
    .update({ safe_id: targetId })
    .in('id', accountIds);
    
  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // Log the move activity
  await logActivity({
    safeId: targetId,
    userId: ownerId,
    action: 'accounts_moved',
    details: {
      source_safe_id: sourceId,
      account_count: accountIds.length,
      account_ids: accountIds
    }
  });
  
  return data;
}
