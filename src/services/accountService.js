import supabase, { supabaseAdmin } from '../utils/supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../utils/encryption.js';
import { encryptAccountFields, decryptAccountFields, encryptField, decryptField } from '../utils/secureEncryption.js';
import crypto from 'crypto';

const TABLE = 'privileged_accounts';
const HISTORY_TABLE = 'account_rotation_history';

export async function createAccount({ ownerId, name, system_type, hostname_ip, port, username, password, connection_method, platform_id, rotation_policy, safe_id, notes }) {
  console.log('=== Starting Account Creation Process ===');
  
  try {
    // Log input parameters (without sensitive data)
    console.log('Account creation parameters:', {
      ownerId: ownerId || 'MISSING',
      name_provided: name ? 'YES' : 'NO',
      system_type: system_type || 'MISSING',
      hostname_provided: hostname_ip ? 'YES' : 'NO',
      port: port || 'NOT_PROVIDED',
      username_provided: username ? 'YES' : 'NO',
      password_provided: password ? 'YES' : 'NO',
      password_length: password ? password.length : 0,
      connection_method: connection_method || 'NOT_PROVIDED',
      platform_id: platform_id || 'NOT_PROVIDED',
      safe_id: safe_id || 'NOT_PROVIDED',
      notes_provided: notes ? 'YES' : 'NO',
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
    
    // Encrypt all sensitive fields
    console.log('Encrypting sensitive data...');
    let encryptedFields;
    try {
      const accountData = {
        name,
        username,
        hostname_ip,
        password,
        notes
      };
      encryptedFields = encryptAccountFields(accountData);
      console.log('✓ Sensitive data encryption successful');
    } catch (encryptError) {
      console.error('Encryption failed:', encryptError);
      throw new Error(`Encryption failed: ${encryptError.message}`);
    }
    
    // Prepare account object
    const accountId = uuidv4();
    const account = {
      id: accountId,
      owner_id: ownerId,
      system_type,
      port: port || null,
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
      // Encrypted fields
      ...encryptedFields
    };
    
    console.log('Account object prepared:', {
      id: account.id,
      owner_id: account.owner_id,
      system_type: account.system_type,
      port: account.port,
      connection_method: account.connection_method,
      platform_id: account.platform_id,
      safe_id: account.safe_id,
      status: account.status,
      encrypted_fields_count: Object.keys(encryptedFields).length
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
      return accounts.map(account => decryptAccountFields(account));
    }
    
    // Create user email map
    const userEmailMap = {};
    authUsers.users.forEach(user => {
      userEmailMap[user.id] = user.email;
    });
    
    return accounts.map(account => {
      const decryptedAccount = decryptAccountFields(account);
      return {
        ...decryptedAccount,
        owner_email: userEmailMap[account.owner_id] || 'Unknown User',
        rotation_status: getRotationStatus(account)
      };
    });
  } catch (error) {
    console.error('Error enriching accounts with user data:', error);
    return accounts.map(account => decryptAccountFields(account));
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
  console.log(`Querying account: id=${id}, ownerId=${ownerId}, role=${role}`);
  
  let query = supabase.from(TABLE).select('*').eq('id', id);

  if (role === 'User') {
    query = query.eq('owner_id', ownerId);
  }

  // First, let's see what we get without .single()
  const { data: allData, error: listError } = await query;
  console.log('Query results without .single():', { count: allData?.length, error: listError });
  
  if (listError) {
    console.error('List query error:', listError);
    throw new Error(`Database error: ${listError.message}`);
  }
  
  if (!allData || allData.length === 0) {
    throw new Error('Account not found');
  }
  
  if (allData.length > 1) {
    console.warn(`Multiple accounts found for ID ${id}:`, allData.map(a => ({ id: a.id, owner_id: a.owner_id })));
    throw new Error('Multiple accounts found with same ID');
  }

  const data = allData[0];
  console.log('Found account:', { id: data.id, owner_id: data.owner_id, system_type: data.system_type });

  return decryptAccountFields(data);
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

export async function validateAccountCredentials({ id, ownerId, role, force = false }) {
  try {
    console.log(`Starting account validation for account ${id}, ownerId: ${ownerId}, role: ${role}`);
    
    // Get the account details
    const account = await getAccountById({ id, ownerId, role });
    if (!account) {
      throw new Error('Account not found');
    }
    
    console.log('Account retrieved:', {
      id: account.id,
      system_type: account.system_type,
      connection_method: account.connection_method,
      hostname_ip: account.hostname_ip,
      username: account.username,
      has_password: !!account.password,
      has_encrypted_password: !!account.encrypted_password
    });
    
    // Convert account to credential format for verification
    const credentialType = mapAccountTypeToCredentialType(account.system_type, account.connection_method);
    
    // Ensure password is properly decrypted
    let password = account.password;
    if (!password && account.encrypted_password) {
      try {
        password = decryptField(account.encrypted_password);
      } catch (error) {
        console.error('Failed to decrypt account password:', error);
        throw new Error('Account password could not be decrypted for validation');
      }
    }
    
    if (!password) {
      throw new Error('Account password is missing or could not be decrypted');
    }
    
    // Create credential data in the format expected by CPM verifiers
    const connectionConfig = {
      host: account.hostname_ip,
      port: account.port,
      username: account.username,
      password: password
    };
    
    const credentialData = {
      id: account.id,
      type: credentialType,
      host: account.hostname_ip,
      port: account.port,
      username: account.username,
      value: encrypt(JSON.stringify(connectionConfig)), // Encrypt the connection config
      connection_method: account.connection_method,
      system_type: account.system_type
    };
    
    console.log(`Account mapped to credential type: ${credentialType}`);
    
    // Import the CPM verification service
    const { CPMService } = await import('../cpm/services/CPMService.js');
    const { CPMConfig } = await import('../cpm/config/cpmConfig.js');
    
    // Create a temporary CPM service for validation
    const config = CPMConfig.getInstance();
    const cpmService = new CPMService(config);
    
    // Perform verification
    const result = await cpmService.verifyCredential(credentialData);
    
    // Store validation result
    await storeValidationResult(account.id, result, ownerId);
    
    console.log(`Account validation completed for ${id}: ${result.verificationResult.success ? 'SUCCESS' : 'FAILED'}`);
    
    return {
      account_id: account.id,
      validation_status: result.verificationResult.success ? 'valid' : 'invalid',
      validation_message: result.verificationResult.message,
      validation_timestamp: new Date().toISOString(),
      duration_ms: result.duration
    };
    
  } catch (error) {
    console.error(`Account validation failed for ${id}:`, error);
    
    // Store failed validation result
    await storeValidationResult(id, {
      verificationResult: {
        success: false,
        message: error.message,
        error_category: 'validation_error'
      },
      duration: 0
    }, ownerId);
    
    throw error;
  }
}

function mapAccountTypeToCredentialType(systemType, connectionMethod) {
  // Map account system types to credential types that CPM verifiers understand
  const systemTypeLower = systemType?.toLowerCase() || '';
  const connectionMethodLower = connectionMethod?.toLowerCase() || '';
  
  // SSH-based systems
  if (connectionMethodLower.includes('ssh') || 
      systemTypeLower.includes('linux') || 
      systemTypeLower.includes('unix') ||
      connectionMethodLower.includes('sftp')) {
    return 'ssh';
  }
  
  // Windows/RDP systems  
  if (connectionMethodLower.includes('rdp') || 
      connectionMethodLower.includes('winrm') ||
      connectionMethodLower.includes('powershell') ||
      systemTypeLower.includes('windows')) {
    return 'password'; // Uses Windows verifier
  }
  
  // Database systems
  if (systemTypeLower.includes('database') || 
      systemTypeLower.includes('oracle') ||
      connectionMethodLower.includes('sql')) {
    return 'database';
  }
  
  // Web-based systems
  if (systemTypeLower.includes('website') ||
      systemTypeLower.includes('application') ||
      connectionMethodLower.includes('http')) {
    return 'password'; // Uses Website verifier
  }
  
  // Cloud/API systems
  if (systemTypeLower.includes('cloud') ||
      systemTypeLower.includes('aws') ||
      systemTypeLower.includes('azure') ||
      connectionMethodLower.includes('api')) {
    return 'api_token';
  }
  
  // Certificate-based
  if (systemTypeLower.includes('certificate') ||
      systemTypeLower.includes('security')) {
    return 'certificate';
  }
  
  // Default to password type for general systems
  return 'password';
}

async function storeValidationResult(accountId, verificationResult, validatedBy) {
  try {
    const validationEntry = {
      account_id: accountId,
      validation_status: verificationResult.verificationResult.success ? 'valid' : 'invalid',
      validation_message: verificationResult.verificationResult.message,
      error_category: verificationResult.verificationResult.error_category || null,
      duration_ms: verificationResult.duration || 0,
      validated_by: validatedBy,
      validated_at: new Date().toISOString()
    };
    
    // Store in account_validation_history table (we'll create this)
    const { error } = await supabase
      .from('account_validation_history')
      .insert([validationEntry]);
    
    if (error) {
      console.error('Failed to store validation result:', error);
      // Don't throw - validation succeeded even if we can't store the history
    }
    
    // Update the account's last validation status
    const { error: updateError } = await supabase
      .from(TABLE)
      .update({
        last_validation_status: validationEntry.validation_status,
        last_validated_at: validationEntry.validated_at,
        validation_message: validationEntry.validation_message
      })
      .eq('id', accountId);
    
    if (updateError) {
      console.error('Failed to update account validation status:', updateError);
    }
    
  } catch (error) {
    console.error('Error storing validation result:', error);
  }
}

export async function getValidationHistory({ accountId, ownerId, role }) {
  try {
    // First verify the user has access to this account
    const account = await getAccountById({ id: accountId, ownerId, role });
    if (!account) {
      throw new Error('Account not found or access denied');
    }
    
    const { data, error } = await supabase
      .from('account_validation_history')
      .select('*')
      .eq('account_id', accountId)
      .order('validated_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('Failed to fetch validation history:', error);
      return []; // Return empty array if table doesn't exist yet
    }
    
    return data || [];
  } catch (error) {
    console.error('Error getting validation history:', error);
    return [];
  }
}

export async function findAccountsForVerification({ statuses, lastValidatedBefore, limit = 10 }) {
  try {
    let query = supabase
      .from(TABLE)
      .select('*')
      .in('status', statuses);
    
    // Add condition for accounts that haven't been validated recently
    if (lastValidatedBefore) {
      query = query.or(`last_validated_at.is.null,last_validated_at.lt.${lastValidatedBefore}`);
    }
    
    query = query
      .order('created_at', { ascending: true })
      .limit(limit);
    
    const { data, error } = await query;
    if (error) throw error;
    
    // Decrypt the accounts before returning
    return (data || []).map(account => decryptAccountFields(account));
    
  } catch (error) {
    console.error('Failed to find accounts for verification:', error);
    throw error;
  }
}

export async function updateAccountVerificationStatus({ 
  accountId, 
  status, 
  verifiedAt, 
  verificationMessage, 
  durationMs,
  lastAttemptAt 
}) {
  try {
    const updateData = {
      last_validation_status: status,
      validation_message: verificationMessage
    };
    
    if (verifiedAt) {
      updateData.last_validated_at = verifiedAt;
    }
    
    if (lastAttemptAt) {
      updateData.last_validation_attempt = lastAttemptAt;
    }
    
    // If verification succeeded, also update account status
    if (status === 'verified') {
      updateData.status = 'active';
    }
    
    const { error } = await supabase
      .from(TABLE)
      .update(updateData)
      .eq('id', accountId);
    
    if (error) {
      console.error('Failed to update account verification status:', error);
      throw error;
    }
    
    // Also store in validation history
    if (status && verificationMessage) {
      const historyEntry = {
        account_id: accountId,
        validation_status: status,
        validation_message: verificationMessage,
        duration_ms: durationMs || 0,
        validated_by: 'system',
        validated_at: verifiedAt || new Date().toISOString()
      };
      
      const { error: historyError } = await supabase
        .from('account_validation_history')
        .insert([historyEntry]);
      
      if (historyError) {
        console.error('Failed to store validation history:', historyError);
        // Don't throw - main update succeeded
      }
    }
    
  } catch (error) {
    console.error('Error updating account verification status:', error);
    throw error;
  }
}

export async function getAccountVerificationStatistics() {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('last_validation_status, status');
    
    if (error) throw error;
    
    const stats = {
      total: data.length,
      verified: 0,
      failed: 0,
      pending: 0,
      never_validated: 0,
      by_account_status: {},
      by_validation_status: {}
    };
    
    data.forEach(account => {
      // Count by validation status
      const validationStatus = account.last_validation_status || 'never_validated';
      stats.by_validation_status[validationStatus] = (stats.by_validation_status[validationStatus] || 0) + 1;
      
      // Count by account status
      const accountStatus = account.status || 'unknown';
      stats.by_account_status[accountStatus] = (stats.by_account_status[accountStatus] || 0) + 1;
      
      // Count main categories
      if (validationStatus === 'verified') stats.verified++;
      else if (validationStatus === 'invalid' || validationStatus === 'failed') stats.failed++;
      else if (validationStatus === 'pending') stats.pending++;
      else stats.never_validated++;
    });
    
    return stats;
    
  } catch (error) {
    console.error('Error getting account verification statistics:', error);
    return {
      total: 0,
      verified: 0,
      failed: 0,
      pending: 0,
      never_validated: 0,
      by_account_status: {},
      by_validation_status: {}
    };
  }
}

export async function createAuditLog({ userId, action, resource, metadata }) {
  try {
    const auditEntry = {
      user_id: userId === 'system' ? null : userId,
      action,
      resource,
      metadata: metadata || {},
      created_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('audit_logs')
      .insert([auditEntry]);
    
    if (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw - this shouldn't stop the main operation
    }
    
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}
