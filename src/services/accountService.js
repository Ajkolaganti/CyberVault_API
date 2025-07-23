import supabase, { supabaseAdmin } from '../utils/supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../utils/encryption.js';
import crypto from 'crypto';

const TABLE = 'privileged_accounts';
const HISTORY_TABLE = 'account_rotation_history';

export async function createAccount({ ownerId, name, system_type, hostname_ip, port, username, password, connection_method, platform_id, rotation_policy, safe_id }) {
  console.log('=== Starting Account Creation Process ===');
  
  try {
    // Log input parameters (without sensitive data)
    console.log('Account creation parameters:', {
      ownerId: ownerId || 'MISSING',
      name: name || 'NOT_PROVIDED',
      system_type: system_type || 'MISSING',
      hostname_ip: hostname_ip || 'MISSING',
      port: port || 'NOT_PROVIDED',
      username: username || 'MISSING',
      password_provided: password ? 'YES' : 'NO',
      password_length: password ? password.length : 0,
      connection_method: connection_method || 'NOT_PROVIDED',
      platform_id: platform_id || 'NOT_PROVIDED',
      safe_id: safe_id || 'NOT_PROVIDED',
      rotation_policy_provided: rotation_policy ? 'YES' : 'NO'
    });
    
    // Validate required fields
    if (!ownerId) {
      throw new Error('Owner ID is required');
    }
    if (!system_type) {
      throw new Error('System type is required');
    }
    if (!hostname_ip) {
      throw new Error('Hostname/IP is required');
    }
    if (!username) {
      throw new Error('Username is required');
    }
    if (!password) {
      throw new Error('Password is required');
    }
    
    console.log('✓ Input validation passed');
    
    // Validate safe_id if provided
    if (safe_id) {
      console.log(`Validating safe_id: ${safe_id}`);
      const { data: safeExists, error: safeError } = await supabase
        .from('safes')
        .select('id, name')
        .eq('id', safe_id)
        .single();
        
      if (safeError) {
        console.error('Safe validation error:', safeError);
        throw new Error(`Invalid safe ID: ${safeError.message}`);
      }
      
      if (!safeExists) {
        throw new Error(`Safe with ID ${safe_id} does not exist`);
      }
      
      console.log(`✓ Safe validation passed: ${safeExists.name}`);
    }
    
    // Encrypt password
    console.log('Encrypting password...');
    let encryptedPassword;
    try {
      encryptedPassword = encrypt(password);
      console.log('✓ Password encryption successful');
    } catch (encryptError) {
      console.error('Password encryption failed:', encryptError);
      throw new Error(`Password encryption failed: ${encryptError.message}`);
    }
    
    // Prepare account object
    const accountId = uuidv4();
    const account = {
      id: accountId,
      owner_id: ownerId,
      name: name || null,
      system_type,
      hostname_ip,
      port: port || null,
      username,
      encrypted_password: encryptedPassword,
      connection_method: connection_method || null,
      platform_id: platform_id || null,
      rotation_policy: rotation_policy || {
        enabled: false,
        interval_days: 90,
        complexity_requirements: {
          min_length: 12,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_symbols: true
        },
        notification_days: 7,
        auto_rotate: false
      },
      safe_id: safe_id || null,
      status: 'active',
      created_at: new Date(),
    };
    
    console.log('Account object prepared:', {
      id: account.id,
      owner_id: account.owner_id,
      name: account.name,
      system_type: account.system_type,
      hostname_ip: account.hostname_ip,
      port: account.port,
      username: account.username,
      encrypted_password_length: account.encrypted_password ? account.encrypted_password.length : 0,
      connection_method: account.connection_method,
      platform_id: account.platform_id,
      safe_id: account.safe_id,
      status: account.status
    });
    
    // Insert into database
    console.log('Inserting account into database...');
    const { data, error } = await supabase
      .from(TABLE)
      .insert([account])
      .select()
      .single();
    
    if (error) {
      console.error('Database insertion error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      // Provide user-friendly error messages
      if (error.code === '23505') {
        throw new Error('An account with this combination already exists');
      } else if (error.code === '23503') {
        throw new Error('Referenced resource (safe or owner) does not exist');
      } else if (error.code === '23514') {
        throw new Error('Invalid value provided for one of the fields. Please check your input.');
      } else {
        throw new Error(`Database error: ${error.message}`);
      }
    }
    
    console.log('✓ Account successfully created:', {
      id: data.id,
      system_type: data.system_type,
      hostname_ip: data.hostname_ip,
      username: data.username
    });
    
    console.log('=== Account Creation Process Completed ===');
    return data;
    
  } catch (error) {
    console.error('=== Account Creation Failed ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('=== End Error Details ===');
    throw error;
  }
}

export async function listAccounts({ ownerId, role, system_type, status, safe_id, limit = 50, offset = 0 }) {
  console.log(`Fetching accounts for ownerId: ${ownerId}, role: ${role}`);
  
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }
  
  // Apply filters
  if (system_type) {
    query = query.eq('system_type', system_type);
  }
  
  if (status) {
    query = query.eq('status', status);
  }
  
  if (safe_id) {
    query = query.eq('safe_id', safe_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  console.log(`Found ${data ? data.length : 0} accounts`);
  
  return await enrichAccountsWithUserData(data || []);
}

// Helper function to enrich accounts with user data
async function enrichAccountsWithUserData(accounts) {
  if (!accounts || accounts.length === 0) {
    return [];
  }
  
  try {
    const ownerIds = [...new Set(accounts.map(account => account.owner_id))];
    
    // Get user emails
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) {
      console.warn('Could not fetch user emails:', authError);
      return accounts.map(account => ({
        ...account,
        decrypted_password: decrypt(account.encrypted_password),
      }));
    }
    
    // Create user email map
    const userEmailMap = {};
    authUsers.users.forEach(user => {
      userEmailMap[user.id] = user.email;
    });
    
    return accounts.map(account => ({
      ...account,
      decrypted_password: decrypt(account.encrypted_password),
      owner_email: userEmailMap[account.owner_id] || 'Unknown User',
      rotation_status: getRotationStatus(account)
    }));
  } catch (error) {
    console.error('Error enriching accounts with user data:', error);
    return accounts.map(account => ({
      ...account,
      decrypted_password: decrypt(account.encrypted_password),
    }));
  }
}

// Helper function to determine rotation status
function getRotationStatus(account) {
  if (!account.next_rotation) return 'no_policy';
  
  const now = new Date();
  const nextRotation = new Date(account.next_rotation);
  const daysDiff = Math.ceil((nextRotation - now) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) return 'overdue';
  if (daysDiff <= 7) return 'due_soon';
  return 'current';
}

export async function getAccountById({ id, ownerId, role }) {
  let query = supabase.from(TABLE).select('*').eq('id', id).single();

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return {
    ...data,
    decrypted_password: decrypt(data.encrypted_password),
  };
}

export async function updateAccount({ id, ownerId, role, updates }) {
  const { password, ...restUpdates } = updates;
  if (password) {
    restUpdates.encrypted_password = encrypt(password);
  }

  let query = supabase
    .from(TABLE)
    .update(restUpdates)
    .eq('id', id)
    .single();

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function deleteAccount({ id, ownerId, role }) {
  let query = supabase.from(TABLE).delete().eq('id', id).single();
  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;
  console.log('data', data);
  console.log('error', error);
  if (error) throw error;
  return data;
}

export async function rotateAccountPassword({ id, ownerId, role }) {
  let selectQuery = supabase.from(TABLE).select('*').eq('id', id).single();
  if (role === 'User') {
    selectQuery = selectQuery.eq('owner_id', ownerId);
  }

  const { data: account, error: selectError } = await selectQuery;
  if (selectError) throw selectError;
  if (!account) throw new Error('Account not found');

  const currentPasswordHash = encrypt(account.decrypted_password);
  const rotationType = 'automatic';
  const newPassword = uuidv4(); // Generate new password
  const encryptedNewPassword = encrypt(newPassword);

  const updateQuery = supabase
    .from(TABLE)
    .update({
      encrypted_password: encryptedNewPassword,
      last_rotated: new Date(),
      status: 'active',
    })
    .eq('id', id)
    .single();

  const rotationHistoryEntry = {
    account_id: id,
    rotated_by: ownerId,
    rotation_type: rotationType,
    previous_password_hash: currentPasswordHash,
    rotation_status: 'success',
    rotated_at: new Date(),
  };

  const historyQuery = supabase.from(HISTORY_TABLE).insert([rotationHistoryEntry]);

  const [{ error: updateError }, { error: historyError }] = await Promise.all([updateQuery, historyQuery]);

  if (updateError || historyError) {
    throw new Error('Rotation failed');
  }

  return {
    ...account,
    decrypted_password: newPassword,
  };
}

export async function listRotationHistory(accountId) {
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .eq('account_id', accountId)
    .order('rotated_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getAccountStatistics({ ownerId, role }) {
  try {
    let baseQuery = supabase.from(TABLE);
    
    if (role === 'User') {
      baseQuery = baseQuery.eq('owner_id', ownerId);
    }
    
    const [totalResult, activeResult, inactiveResult, rotationDueResult, systemTypesResult] = await Promise.all([
      // Total accounts
      baseQuery.select('id', { count: 'exact', head: true }),
      
      // Active accounts
      baseQuery.select('id', { count: 'exact', head: true }).eq('status', 'active'),
      
      // Inactive accounts
      baseQuery.select('id', { count: 'exact', head: true }).eq('status', 'inactive'),
      
      // Accounts requiring rotation (overdue)
      baseQuery.select('id', { count: 'exact', head: true }).lt('next_rotation', new Date().toISOString()),
      
      // System type distribution
      baseQuery.select('system_type')
    ]);
    
    // Count by system type
    const systemTypeCounts = {};
    systemTypesResult.data?.forEach(account => {
      systemTypeCounts[account.system_type] = (systemTypeCounts[account.system_type] || 0) + 1;
    });
    
    return {
      total: totalResult.count || 0,
      active: activeResult.count || 0,
      inactive: inactiveResult.count || 0,
      rotation_due: rotationDueResult.count || 0,
      system_types: systemTypeCounts,
      last_updated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting account statistics:', error);
    throw error;
  }
}

export function generateSecurePassword(requirements = {}) {
  const {
    min_length = 16,
    require_uppercase = true,
    require_lowercase = true,
    require_numbers = true,
    require_symbols = true
  } = requirements;
  
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let charset = '';
  let requiredChars = '';
  
  if (require_lowercase) {
    charset += lowercase;
    requiredChars += lowercase[Math.floor(Math.random() * lowercase.length)];
  }
  
  if (require_uppercase) {
    charset += uppercase;
    requiredChars += uppercase[Math.floor(Math.random() * uppercase.length)];
  }
  
  if (require_numbers) {
    charset += numbers;
    requiredChars += numbers[Math.floor(Math.random() * numbers.length)];
  }
  
  if (require_symbols) {
    charset += symbols;
    requiredChars += symbols[Math.floor(Math.random() * symbols.length)];
  }
  
  // Generate remaining characters
  const remainingLength = min_length - requiredChars.length;
  let password = requiredChars;
  
  for (let i = 0; i < remainingLength; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export async function checkAccountsRequiringRotation() {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('status', 'active')
    .lt('next_rotation', now);
    
  if (error) throw error;
  return data || [];
}
