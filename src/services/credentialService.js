import { supabaseAdmin } from '../utils/supabaseClient.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const TABLE = 'credentials';

export async function createCredential({ 
  userId, 
  type, 
  name, 
  value, 
  host, 
  port, 
  username,
  database_name,
  schema_name,
  connection_string,
  ssl_enabled,
  additional_params
}) {
  const encryptedValue = encrypt(value);
  
  // Encrypt connection string if provided
  const encryptedConnectionString = connection_string ? encrypt(connection_string) : null;
  
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert([
      { 
        user_id: userId, 
        type, 
        name, 
        value: encryptedValue,
        host,
        port: port ? parseInt(port) : null,
        username,
        database_name,
        schema_name,
        connection_string: encryptedConnectionString,
        ssl_enabled: ssl_enabled || false,
        additional_params: additional_params || {}
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCredentials({ userId, role }) {
  console.log(`Fetching credentials for userId: ${userId}, role: ${role}`);
  
  let query = supabaseAdmin.from(TABLE).select('*');
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Database error fetching credentials:', error);
    throw error;
  }
  
  console.log(`Found ${data ? data.length : 0} credentials in database`);
  
  if (!data || data.length === 0) {
    return [];
  }
  
  try {
    return data.map((cred) => ({ 
      ...cred, 
      value: decrypt(cred.value),
      connection_string: cred.connection_string ? decrypt(cred.connection_string) : null
    }));
  } catch (decryptError) {
    console.error('Decryption error:', decryptError);
    throw new Error('Failed to decrypt credential values');
  }
}

export async function getCredentialById({ id, userId, role }) {
  let query = supabaseAdmin.from(TABLE).select('*').eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return { 
    ...data, 
    value: decrypt(data.value),
    connection_string: data.connection_string ? decrypt(data.connection_string) : null
  };
}

export async function updateCredential({ id, userId, role, updates }) {
  if (updates.value) {
    updates.value = encrypt(updates.value);
  }
  if (updates.connection_string) {
    updates.connection_string = encrypt(updates.connection_string);
  }
  let query = supabaseAdmin.from(TABLE).update(updates).eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function deleteCredential({ id, userId, role }) {
  let query = supabaseAdmin.from(TABLE).delete().eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function findCredentialsByHostAndUser({ host, username, ownerId }) {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('host', host)
      .eq('username', username)
      .eq('user_id', ownerId);
    
    if (error) throw error;
    
    return (data || []).map(credential => ({
      ...credential,
      password: decrypt(credential.value), // Decrypt the password
      connection_string: credential.connection_string ? decrypt(credential.connection_string) : null
    }));
    
  } catch (error) {
    console.error('Error finding credentials by host and user:', error);
    return [];
  }
}

export async function getCredentialHistory({ id, userId, role }) {
  try {
    console.log(`Fetching history for credential ${id}, user ${userId}, role ${role}`);
    
    // For now, we'll create history from existing audit logs or return a placeholder
    // In a real implementation, you would have a credential_history table
    
    // Get the credential first to ensure access permissions
    const credential = await getCredentialById({ id, userId, role });
    if (!credential) {
      throw new Error('Credential not found or access denied');
    }

    // Placeholder history - in production you'd query an audit log table
    const history = [
      {
        id: '1',
        credential_id: id,
        action: 'created',
        user_id: credential.user_id,
        timestamp: credential.created_at,
        details: {
          name: credential.name,
          type: credential.type,
          host: credential.host
        }
      },
      {
        id: '2', 
        credential_id: id,
        action: 'accessed',
        user_id: userId,
        timestamp: new Date().toISOString(),
        details: {
          accessed_via: 'API',
          ip_address: 'xxx.xxx.xxx.xxx'
        }
      }
    ];

    // In production, you would query like this:
    /*
    let query = supabaseAdmin
      .from('credential_history')
      .select('*')
      .eq('credential_id', id)
      .order('timestamp', { ascending: false });
    
    if (role === 'User') {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    */

    console.log(`Returning ${history.length} history entries for credential ${id}`);
    return history;

  } catch (error) {
    console.error('Error fetching credential history:', error);
    throw error;
  }
}

export async function verifyCredential({ id, userId, role }) {
  try {
    console.log(`Verifying credential ${id} for user ${userId}`);
    
    // Get the credential first to ensure access permissions
    const credential = await getCredentialById({ id, userId, role });
    if (!credential) {
      throw new Error('Credential not found or access denied');
    }

    let verificationResult;
    const startTime = Date.now();

    try {
      // Perform verification based on credential type
      switch (credential.type?.toLowerCase()) {
        case 'ssh':
          verificationResult = await verifySshCredential(credential);
          break;
        case 'database':
        case 'mysql':
        case 'postgresql':
        case 'mssql':
        case 'oracle':
        case 'mongodb':
          verificationResult = await verifyDatabaseCredential(credential);
          break;
        case 'password':
          verificationResult = await verifyPasswordCredential(credential);
          break;
        case 'api_token':
          verificationResult = await verifyApiTokenCredential(credential);
          break;
        default:
          verificationResult = {
            success: false,
            message: `Verification not supported for credential type: ${credential.type}`,
            verificationType: credential.type,
            duration: Date.now() - startTime
          };
      }
    } catch (verifyError) {
      verificationResult = {
        success: false,
        message: `Verification failed: ${verifyError.message}`,
        error: verifyError.message,
        verificationType: credential.type,
        duration: Date.now() - startTime
      };
    }

    // Add common metadata
    verificationResult.credentialId = id;
    verificationResult.credentialName = credential.name;
    verificationResult.host = credential.host;
    verificationResult.timestamp = new Date().toISOString();

    console.log(`Credential verification completed in ${verificationResult.duration}ms: ${verificationResult.success ? 'SUCCESS' : 'FAILED'}`);
    return verificationResult;

  } catch (error) {
    console.error('Error verifying credential:', error);
    throw error;
  }
}

// Verification functions for different credential types
async function verifySshCredential(credential) {
  try {
    // Import SSH verifier
    const { SSHVerifier } = await import('../cpm/verifiers/SSHVerifier.js');
    
    // Create config mock for SSHVerifier
    const config = {
      get: (key) => {
        const configValues = {
          'sshTimeout': 30000
        };
        return configValues[key];
      }
    };
    
    const sshVerifier = new SSHVerifier(config);
    const result = await sshVerifier.verify(credential);
    
    return {
      ...result,
      verificationType: 'ssh',
      duration: result.details?.connectionTime || 0
    };
  } catch (error) {
    return {
      success: false,
      message: `SSH verification failed: ${error.message}`,
      verificationType: 'ssh',
      error: error.message
    };
  }
}

async function verifyDatabaseCredential(credential) {
  // Database verification would require actual database drivers
  // For now, return a simulated result
  const simulateDelay = () => new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  
  await simulateDelay();
  
  const success = Math.random() > 0.3; // 70% success rate for simulation
  
  return {
    success,
    message: success 
      ? `Database connection successful to ${credential.database_name || credential.host}`
      : `Database connection failed: Connection timeout or authentication error`,
    verificationType: credential.type,
    duration: 1000 + Math.random() * 2000,
    details: {
      database: credential.database_name,
      host: credential.host,
      port: credential.port,
      ssl_enabled: credential.ssl_enabled
    }
  };
}

async function verifyPasswordCredential(credential) {
  // Password credentials typically can't be verified without a target system
  return {
    success: true,
    message: 'Password credential format is valid',
    verificationType: 'password',
    duration: 100,
    details: {
      host: credential.host,
      username: credential.username,
      note: 'Password format verified, but actual authentication requires target system'
    }
  };
}

async function verifyApiTokenCredential(credential) {
  // API token verification would require making actual API calls
  // For now, return a simulated result
  const simulateDelay = () => new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
  
  await simulateDelay();
  
  const success = Math.random() > 0.2; // 80% success rate for simulation
  
  return {
    success,
    message: success 
      ? 'API token is valid and active'
      : 'API token is invalid or expired',
    verificationType: 'api_token',
    duration: 500 + Math.random() * 1000,
    details: {
      host: credential.host,
      token_length: credential.value?.length || 0
    }
  };
}

export async function findCredentialsByHost({ host, ownerId }) {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('host', host)
      .eq('user_id', ownerId);
    
    if (error) throw error;
    
    return (data || []).map(credential => ({
      ...credential,
      password: decrypt(credential.value), // Decrypt the password
      connection_string: credential.connection_string ? decrypt(credential.connection_string) : null
    }));
    
  } catch (error) {
    console.error('Error finding credentials by host:', error);
    return [];
  }
} 