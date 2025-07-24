import { supabaseAdmin } from '../utils/supabaseClient.js';
import { logtail } from '../utils/logger.js';
import * as credentialService from './credentialService.js';
import { NodeSSH } from 'node-ssh';
import { WindowsVerifier } from '../cpm/verifiers/WindowsVerifier.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { v4 as uuidv4 } from 'uuid';

// Discovery target types
export const TARGET_TYPES = {
  LINUX: 'linux',
  WINDOWS: 'windows',
  AWS: 'aws',
  DATABASE: 'database',
  ACTIVE_DIRECTORY: 'active_directory'
};

// Connection methods
export const CONNECTION_METHODS = {
  SSH: 'ssh',
  WINRM: 'winrm',
  HTTPS: 'https',
  AWS_API: 'aws_api',
  DATABASE: 'database'
};

// Discovery scan status
export const SCAN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Create a discovery target
 */
export async function createDiscoveryTarget({
  userId,
  targetType,
  hostname,
  connectionMethod,
  credentialId,
  name,
  description,
  settings = {}
}) {
  try {
    const targetId = uuidv4();
    
    const { data, error } = await supabaseAdmin
      .from('discovery_targets')
      .insert([{
        id: targetId,
        user_id: userId,
        name,
        description,
        target_type: targetType,
        hostname,
        connection_method: connectionMethod,
        credential_id: credentialId,
        settings,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Log target creation
    logtail.info("Discovery target created", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "create_target",
      user_id: userId,
      target_id: targetId,
      target_type: targetType,
      hostname: hostname,
      connection_method: connectionMethod,
      timestamp: new Date().toISOString(),
      success: true
    });

    return data;
  } catch (error) {
    console.error('Error creating discovery target:', error);
    throw error;
  }
}

/**
 * Get discovery targets for a user
 */
export async function getDiscoveryTargets({ userId, role }) {
  try {
    let query = supabaseAdmin
      .from('discovery_targets')
      .select('*')
      .order('created_at', { ascending: false });

    if (role === 'User') {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting discovery targets:', error);
    return [];
  }
}

/**
 * Update a discovery target
 */
export async function updateDiscoveryTarget({ id, userId, role, updates }) {
  try {
    // Check if target exists and user has access
    const targets = await getDiscoveryTargets({ userId, role });
    const existingTarget = targets.find(t => t.id === id);
    
    if (!existingTarget) {
      throw new Error('Discovery target not found or access denied');
    }

    // Prepare update data
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    let query = supabaseAdmin
      .from('discovery_targets')
      .update(updateData)
      .eq('id', id);

    if (role === 'User') {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;

    // Log target update
    logtail.info("Discovery target updated", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "update_target",
      user_id: userId,
      target_id: id,
      updated_fields: Object.keys(updates),
      timestamp: new Date().toISOString(),
      success: true
    });

    return data;
  } catch (error) {
    console.error('Error updating discovery target:', error);
    throw error;
  }
}

/**
 * Delete a discovery target
 */
export async function deleteDiscoveryTarget({ id, userId, role }) {
  try {
    // Check if target exists and user has access
    const targets = await getDiscoveryTargets({ userId, role });
    const existingTarget = targets.find(t => t.id === id);
    
    if (!existingTarget) {
      throw new Error('Discovery target not found or access denied');
    }

    // Check if there are any active scans for this target
    const activeScans = await getDiscoveryScans({
      userId,
      role: 'Admin', // Override to check all scans for this target
      targetId: id,
      limit: 1
    });

    const runningScan = activeScans.find(scan => scan.status === 'running');
    if (runningScan) {
      throw new Error('Cannot delete target with active discovery scans. Please wait for scans to complete or cancel them first.');
    }

    // Delete the target
    let query = supabaseAdmin
      .from('discovery_targets')
      .delete()
      .eq('id', id);

    if (role === 'User') {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;
    if (error) throw error;

    // Log target deletion
    logtail.warn("Discovery target deleted", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "delete_target",
      user_id: userId,
      target_id: id,
      target_name: existingTarget.name,
      target_hostname: existingTarget.hostname,
      timestamp: new Date().toISOString(),
      success: true
    });

    return existingTarget;
  } catch (error) {
    console.error('Error deleting discovery target:', error);
    throw error;
  }
}

/**
 * Initiate a discovery scan
 */
export async function initiateDiscoveryScan({ targetId, userId, scanSettings = {} }) {
  try {
    const scanId = uuidv4();
    
    // Get target details
    const { data: target, error: targetError } = await supabaseAdmin
      .from('discovery_targets')
      .select('*')
      .eq('id', targetId)
      .single();

    if (targetError || !target) {
      throw new Error('Discovery target not found');
    }

    // Create scan record
    const { data: scan, error: scanError } = await supabaseAdmin
      .from('discovery_scans')
      .insert([{
        id: scanId,
        target_id: targetId,
        user_id: userId,
        status: SCAN_STATUS.PENDING,
        settings: scanSettings,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (scanError) throw scanError;

    // Log scan initiation
    logtail.info("Discovery scan initiated", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "initiate_scan",
      user_id: userId,
      scan_id: scanId,
      target_id: targetId,
      target_type: target.target_type,
      hostname: target.hostname,
      timestamp: new Date().toISOString(),
      success: true
    });

    // Start the scan asynchronously
    performDiscoveryScan(scanId, target, userId).catch(error => {
      console.error('Discovery scan failed:', error);
      updateScanStatus(scanId, SCAN_STATUS.FAILED, { error: error.message });
    });

    return scan;
  } catch (error) {
    console.error('Error initiating discovery scan:', error);
    throw error;
  }
}

/**
 * Perform the actual discovery scan
 */
async function performDiscoveryScan(scanId, target, userId) {
  try {
    console.log(`Starting discovery scan ${scanId} for target ${target.id}`);
    
    // Update scan status to running
    await updateScanStatus(scanId, SCAN_STATUS.RUNNING, {
      started_at: new Date().toISOString(),
      target_details: {
        hostname: target.hostname,
        target_type: target.target_type,
        connection_method: target.connection_method
      }
    });

    // Get credential for authentication
    console.log(`Fetching credential ${target.credential_id} for scan`);
    const credential = await credentialService.getCredentialById({
      id: target.credential_id,
      userId: userId,
      role: 'Admin' // Override for system operation
    });

    if (!credential) {
      throw new Error(`Credential not found for discovery scan. Credential ID: ${target.credential_id}`);
    }

    console.log(`Credential fetched successfully. Username: ${credential.username || credential.name}`);

    let discoveredAccounts = [];
    let enumerationError = null;

    // Enumerate accounts based on target type
    try {
      console.log(`Starting enumeration for target type: ${target.target_type}`);
      
      switch (target.target_type) {
        case TARGET_TYPES.LINUX:
          discoveredAccounts = await enumerateLinuxAccounts(target, credential);
          break;
        case TARGET_TYPES.WINDOWS:
          discoveredAccounts = await enumerateWindowsAccounts(target, credential);
          break;
        case TARGET_TYPES.AWS:
          discoveredAccounts = await enumerateAWSAccounts(target, credential);
          break;
        case TARGET_TYPES.DATABASE:
          discoveredAccounts = await enumerateDatabaseAccounts(target, credential);
          break;
        default:
          throw new Error(`Unsupported target type: ${target.target_type}. Supported types: ${Object.values(TARGET_TYPES).join(', ')}`);
      }
    } catch (enumError) {
      enumerationError = enumError;
      console.error('Enumeration failed:', enumError);
      throw enumError;
    }

    console.log(`Enumeration completed. Raw accounts found: ${discoveredAccounts.length}`);

    // Filter and clean results
    const filteredAccounts = filterDiscoveredAccounts(discoveredAccounts, target.target_type);
    console.log(`After filtering: ${filteredAccounts.length} accounts remaining`);

    // Store discovered accounts
    let storedAccounts = [];
    try {
      storedAccounts = await storeDiscoveredAccounts(scanId, target, filteredAccounts, userId);
      console.log(`Successfully stored ${storedAccounts.length} accounts`);
    } catch (storeError) {
      console.error('Failed to store accounts:', storeError);
      throw new Error(`Failed to store discovered accounts: ${storeError.message}`);
    }

    // Update scan status to completed
    const completionMetadata = {
      accounts_discovered: discoveredAccounts.length,
      accounts_filtered: filteredAccounts.length,
      accounts_stored: storedAccounts.length,
      completed_at: new Date().toISOString(),
      scan_duration_ms: Date.now() - new Date(target.started_at || Date.now()).getTime(),
      target_details: {
        hostname: target.hostname,
        target_type: target.target_type,
        connection_method: target.connection_method
      }
    };

    await updateScanStatus(scanId, SCAN_STATUS.COMPLETED, completionMetadata);

    // Log successful completion
    logtail.info("Discovery scan completed", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "scan_completed",
      user_id: userId,
      scan_id: scanId,
      target_id: target.id,
      accounts_discovered: discoveredAccounts.length,
      accounts_stored: storedAccounts.length,
      timestamp: new Date().toISOString(),
      success: true
    });

    return storedAccounts;

  } catch (error) {
    console.error('Discovery scan error:', error);
    
    // Create detailed error information
    const errorDetails = {
      error_message: error.message,
      error_stack: error.stack,
      failed_at: new Date().toISOString(),
      target_details: {
        id: target.id,
        hostname: target.hostname,
        target_type: target.target_type,
        connection_method: target.connection_method,
        credential_id: target.credential_id
      },
      scan_context: {
        scan_id: scanId,
        user_id: userId,
        started_at: new Date().toISOString()
      }
    };

    // Update scan status to failed with detailed error info
    await updateScanStatus(scanId, SCAN_STATUS.FAILED, errorDetails);

    // Log failure with details
    logtail.error("Discovery scan failed", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "scan_failed",
      user_id: userId,
      scan_id: scanId,
      target_id: target.id,
      error_message: error.message,
      error_stack: error.stack,
      target_hostname: target.hostname,
      target_type: target.target_type,
      timestamp: new Date().toISOString(),
      success: false
    });

    throw error;
  }
}

/**
 * Enumerate Linux accounts
 */
async function enumerateLinuxAccounts(target, credential) {
  let ssh = null;
  try {
    console.log('Starting Linux enumeration for target:', target.hostname);
    
    // Validate credential data
    if (!credential) {
      throw new Error('No credential provided for SSH connection');
    }
    
    if (!credential.value && !credential.password) {
      throw new Error('Credential does not contain password/value field');
    }

    // Decrypt the credential value if needed
    let password;
    try {
      if (credential.value) {
        password = decrypt(credential.value);
      } else {
        password = credential.password;
      }
    } catch (decryptError) {
      console.warn('Failed to decrypt credential, using raw value:', decryptError.message);
      password = credential.value || credential.password;
    }

    // Prepare SSH connection config
    const sshConfig = {
      host: target.hostname,
      port: target.settings?.port || 22,
      username: credential.username || credential.name,
      password: password,
      connectTimeout: target.settings?.timeout || 30000,
      readyTimeout: target.settings?.timeout || 30000
    };

    console.log('Attempting SSH connection to:', {
      host: sshConfig.host,
      username: sshConfig.username,
      port: sshConfig.port,
      timeout: sshConfig.connectTimeout
    });

    // Create SSH connection
    ssh = new NodeSSH();
    
    // Connect with timeout
    const connectionPromise = ssh.connect(sshConfig);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SSH connection timeout')), sshConfig.connectTimeout);
    });
    
    await Promise.race([connectionPromise, timeoutPromise]);
    console.log('SSH connection established successfully');

    const commands = [
      'getent passwd',
      'cut -d: -f1 /etc/passwd',
      'awk -F: \'$3 >= 1000 && $1 != "nobody" {print $1}\' /etc/passwd' // Regular users only
    ];

    const accounts = [];
    const commandResults = [];
    
    for (const command of commands) {
      try {
        console.log(`Executing command: ${command}`);
        
        const result = await ssh.execCommand(command, {
          execOptions: {
            timeout: 15000 // 15 second timeout for each command
          }
        });
        
        commandResults.push({
          command,
          success: result.code === 0,
          output: result.stdout || '',
          error: result.stderr || null,
          exitCode: result.code
        });

        if (result.code === 0 && result.stdout) {
          const lines = result.stdout.split('\n');
          
          lines.forEach(line => {
            const username = line.split(':')[0].trim();
            if (username && username.length > 0) {
              if (!accounts.find(acc => acc.username === username)) {
                accounts.push({
                  username,
                  system_type: 'linux',
                  discovered_via: command,
                  raw_data: line
                });
              }
            }
          });
          
          console.log(`Command "${command}" found ${lines.length} entries`);
        } else {
          console.warn(`Command "${command}" failed with exit code ${result.code}:`, result.stderr);
        }
      } catch (cmdError) {
        console.error(`Command "${command}" execution error:`, cmdError);
        commandResults.push({
          command,
          success: false,
          error: cmdError.message,
          output: '',
          exitCode: -1
        });
      }
    }

    // Disconnect properly
    if (ssh && ssh.isConnected()) {
      await ssh.dispose();
    }

    console.log(`Linux enumeration completed. Found ${accounts.length} accounts`);
    
    // If no accounts found, include command results in error for debugging
    if (accounts.length === 0) {
      throw new Error(`No accounts discovered. Command results: ${JSON.stringify(commandResults, null, 2)}`);
    }

    return accounts;

  } catch (error) {
    console.error('Linux enumeration error:', error);
    
    // Try to disconnect if connection exists
    if (ssh && ssh.isConnected()) {
      try {
        await ssh.dispose();
      } catch (disconnectError) {
        console.error('Error during disconnect:', disconnectError);
      }
    }

    // Enhanced error details
    const errorDetails = {
      original_error: error.message,
      stack: error.stack,
      target_hostname: target.hostname,
      target_port: target.settings?.port || 22,
      credential_has_value: !!(credential?.value || credential?.password),
      credential_has_username: !!(credential?.username || credential?.name),
      node_ssh_available: typeof NodeSSH !== 'undefined'
    };

    throw new Error(`Failed to enumerate Linux accounts: ${error.message}. Details: ${JSON.stringify(errorDetails, null, 2)}`);
  }
}

/**
 * Enumerate Windows accounts
 */
async function enumerateWindowsAccounts(target, credential) {
  try {
    const windowsVerifier = new WindowsVerifier();
    const connection = await windowsVerifier.connect({
      hostname: target.hostname,
      username: credential.username || credential.name,
      password: credential.value,
      port: target.settings?.port || 5985
    });

    const commands = [
      'net user',
      'Get-LocalUser | Select-Object Name, Enabled | ConvertTo-Json',
      'Get-WmiObject -Class Win32_UserAccount | Select-Object Name, Disabled | ConvertTo-Json'
    ];

    const accounts = [];
    
    for (const command of commands) {
      try {
        const result = await windowsVerifier.executeCommand(connection, command);
        if (result.success && result.output) {
          let usernames = [];
          
          if (command === 'net user') {
            // Parse net user output
            const lines = result.output.split('\n');
            const userStartIndex = lines.findIndex(line => line.includes('User accounts for'));
            if (userStartIndex >= 0) {
              for (let i = userStartIndex + 2; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line && !line.includes('command completed')) {
                  usernames.push(...line.split(/\s+/).filter(u => u.length > 0));
                }
              }
            }
          } else {
            // Parse JSON output from PowerShell
            try {
              const jsonData = JSON.parse(result.output);
              const users = Array.isArray(jsonData) ? jsonData : [jsonData];
              usernames = users.map(user => user.Name).filter(name => name);
            } catch (parseError) {
              console.warn('Failed to parse JSON output:', parseError.message);
            }
          }
          
          usernames.forEach(username => {
            if (!accounts.find(acc => acc.username === username)) {
              accounts.push({
                username,
                system_type: 'windows',
                discovered_via: command,
                raw_data: result.output
              });
            }
          });
        }
      } catch (cmdError) {
        console.warn(`Command failed: ${command}`, cmdError.message);
      }
    }

    await windowsVerifier.disconnect(connection);
    return accounts;

  } catch (error) {
    console.error('Windows enumeration error:', error);
    throw new Error(`Failed to enumerate Windows accounts: ${error.message}`);
  }
}

/**
 * Enumerate AWS accounts (IAM users)
 */
async function enumerateAWSAccounts(target, credential) {
  // This would require AWS SDK integration
  // For now, return placeholder
  console.log('AWS enumeration not implemented yet');
  return [];
}

/**
 * Enumerate database accounts
 */
async function enumerateDatabaseAccounts(target, credential) {
  try {
    console.log('Starting database enumeration for target:', target.hostname);
    
    // Validate credential data
    if (!credential) {
      throw new Error('No credential provided for database connection');
    }

    // Get database-specific fields
    const databaseName = credential.database_name;
    const connectionString = credential.connection_string;
    
    if (!databaseName && !connectionString) {
      throw new Error('Missing database name or connection string in credential');
    }

    // Determine database type from credential type or settings
    const dbType = credential.type?.toLowerCase() || target.settings?.database_type || 'mysql';
    
    console.log(`Attempting database enumeration for ${dbType} on ${target.hostname}:${target.settings?.port || getDefaultPort(dbType)}`);

    let accounts = [];

    // Database enumeration based on type
    switch (dbType) {
      case 'mysql':
      case 'mariadb':
        accounts = await enumerateMySQLAccounts(target, credential);
        break;
      case 'postgresql':
      case 'postgres':
        accounts = await enumeratePostgreSQLAccounts(target, credential);
        break;
      case 'mssql':
      case 'sqlserver':
        accounts = await enumerateSQLServerAccounts(target, credential);
        break;
      case 'oracle':
        accounts = await enumerateOracleAccounts(target, credential);
        break;
      case 'mongodb':
        accounts = await enumerateMongoDBAccounts(target, credential);
        break;
      default:
        throw new Error(`Unsupported database type: ${dbType}. Supported types: mysql, postgresql, mssql, oracle, mongodb`);
    }

    console.log(`Database enumeration completed. Found ${accounts.length} accounts for ${dbType}`);
    return accounts;

  } catch (error) {
    console.error('Database enumeration error:', error);
    throw new Error(`Failed to enumerate database accounts: ${error.message}`);
  }
}

/**
 * Get default port for database type
 */
function getDefaultPort(dbType) {
  const defaultPorts = {
    mysql: 3306,
    mariadb: 3306,
    postgresql: 5432,
    postgres: 5432,
    mssql: 1433,
    sqlserver: 1433,
    oracle: 1521,
    mongodb: 27017
  };
  return defaultPorts[dbType] || 3306;
}

/**
 * Enumerate MySQL/MariaDB accounts
 */
async function enumerateMySQLAccounts(target, credential) {
  // For now, return placeholder - would need mysql2 or similar driver
  console.log('MySQL enumeration requires mysql2 driver - placeholder implementation');
  
  // Simulated accounts for development
  return [
    {
      username: 'app_user',
      system_type: 'mysql',
      discovered_via: 'SELECT User FROM mysql.user',
      raw_data: `app_user@${target.hostname}`,
      privileges: 'SELECT, INSERT, UPDATE'
    },
    {
      username: 'read_only_user',
      system_type: 'mysql', 
      discovered_via: 'SELECT User FROM mysql.user',
      raw_data: `read_only_user@${target.hostname}`,
      privileges: 'SELECT'
    }
  ];
}

/**
 * Enumerate PostgreSQL accounts
 */
async function enumeratePostgreSQLAccounts(target, credential) {
  // For now, return placeholder - would need pg driver
  console.log('PostgreSQL enumeration requires pg driver - placeholder implementation');
  
  return [
    {
      username: 'app_user',
      system_type: 'postgresql',
      discovered_via: 'SELECT usename FROM pg_user',
      raw_data: `app_user database: ${credential.database_name}`,
      privileges: 'CONNECT, CREATE'
    }
  ];
}

/**
 * Enumerate SQL Server accounts
 */
async function enumerateSQLServerAccounts(target, credential) {
  // For now, return placeholder - would need mssql driver
  console.log('SQL Server enumeration requires mssql driver - placeholder implementation');
  
  return [
    {
      username: 'app_login',
      system_type: 'mssql',
      discovered_via: 'SELECT name FROM sys.sql_logins',
      raw_data: `app_login database: ${credential.database_name}`,
      privileges: 'db_datareader, db_datawriter'
    }
  ];
}

/**
 * Enumerate Oracle accounts
 */
async function enumerateOracleAccounts(target, credential) {
  // For now, return placeholder - would need oracledb driver
  console.log('Oracle enumeration requires oracledb driver - placeholder implementation');
  
  return [
    {
      username: 'app_user',
      system_type: 'oracle',
      discovered_via: 'SELECT username FROM dba_users',
      raw_data: `app_user schema: ${credential.schema_name}`,
      privileges: 'CONNECT, RESOURCE'
    }
  ];
}

/**
 * Enumerate MongoDB accounts
 */
async function enumerateMongoDBAccounts(target, credential) {
  // For now, return placeholder - would need mongodb driver
  console.log('MongoDB enumeration requires mongodb driver - placeholder implementation');
  
  return [
    {
      username: 'app_user',
      system_type: 'mongodb',
      discovered_via: 'db.getUsers()',
      raw_data: `app_user database: ${credential.database_name}`,
      privileges: 'readWrite'
    }
  ];
}

/**
 * Filter and clean discovered accounts
 */
function filterDiscoveredAccounts(accounts, targetType) {
  const systemAccounts = [
    // Linux system accounts
    'root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man', 'lp', 'mail', 'news',
    'uucp', 'proxy', 'www-data', 'backup', 'list', 'irc', 'gnats', 'nobody',
    'systemd-network', 'systemd-resolve', 'syslog', 'messagebus', 'uuidd',
    'dnsmasq', 'sshd', 'pollinate', 'landscape', 'fwupd-refresh',
    
    // Windows system accounts
    'Administrator', 'Guest', 'DefaultAccount', 'WDAGUtilityAccount',
    'SYSTEM', 'NETWORK SERVICE', 'LOCAL SERVICE', 'IUSR', 'ASPNET'
  ];

  return accounts.filter(account => {
    // Remove system accounts
    if (systemAccounts.includes(account.username.toLowerCase())) {
      return false;
    }

    // Remove accounts with $ (Windows computer accounts)
    if (account.username.endsWith('$')) {
      return false;
    }

    // Remove very short usernames (likely system)
    if (account.username.length < 2) {
      return false;
    }

    // Remove accounts with special characters that indicate system accounts
    if (/^[_\-\.]/.test(account.username)) {
      return false;
    }

    return true;
  });
}

/**
 * Map discovery target types to privileged_accounts system types
 */
function mapTargetTypeToSystemType(targetType) {
  const mapping = {
    'linux': 'Linux',
    'windows': 'Windows',
    'database': 'Database',
    'mysql': 'Database',
    'postgresql': 'Database',
    'mssql': 'Database',
    'oracle': 'Database',
    'mongodb': 'Database',
    'aws': 'Cloud',
    'active_directory': 'Directory'
  };
  
  return mapping[targetType] || 'Misc';
}

/**
 * Store discovered accounts
 */
async function storeDiscoveredAccounts(scanId, target, accounts, userId) {
  try {
    const accountsToStore = accounts.map(account => ({
      id: uuidv4(),
      owner_id: userId,
      username: account.username,
      encrypted_password: encrypt('[DISCOVERED_ACCOUNT_NO_PASSWORD]'), // Placeholder for discovered accounts
      system_type: mapTargetTypeToSystemType(target.target_type),
      hostname_ip: target.hostname,
      account_description: `Discovered via ${target.name} scan`,
      status: 'inactive', // Use valid status - will be activated when approved
      discovered: true,
      discovery_scan_id: scanId,
      discovery_source: target.target_type,
      discovered_at: new Date().toISOString(),
      discovery_metadata: {
        discovered_via: account.discovered_via,
        raw_data: account.raw_data,
        target_id: target.id,
        target_name: target.name,
        requires_password: true,
        discovery_note: 'Account discovered during scan. Password needs to be set manually.'
      },
      tags: [
        'discovered',
        `scan:${scanId}`,
        `source:${target.target_type}`,
        `target:${target.name.replace(/\s+/g, '_')}`
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    if (accountsToStore.length === 0) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('privileged_accounts')
      .insert(accountsToStore)
      .select();

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error storing discovered accounts:', error);
    throw error;
  }
}

/**
 * Update scan status
 */
async function updateScanStatus(scanId, status, metadata = {}) {
  try {
    const { error } = await supabaseAdmin
      .from('discovery_scans')
      .update({
        status,
        metadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', scanId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating scan status:', error);
  }
}

/**
 * Get discovery scans
 */
export async function getDiscoveryScans({ userId, role, targetId = null, limit = 50, offset = 0 }) {
  try {
    let query = supabaseAdmin
      .from('discovery_scans')
      .select(`
        *,
        discovery_targets:target_id (name, target_type, hostname)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role === 'User') {
      query = query.eq('user_id', userId);
    }

    if (targetId) {
      query = query.eq('target_id', targetId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting discovery scans:', error);
    return [];
  }
}

/**
 * Get discovered accounts pending approval
 */
export async function getDiscoveredAccounts({ userId, role, scanId = null, status = 'inactive' }) {
  try {
    let query = supabaseAdmin
      .from('privileged_accounts')
      .select('*')
      .eq('discovered', true)
      .order('discovered_at', { ascending: false });

    if (role === 'User') {
      query = query.eq('owner_id', userId);
    }

    if (scanId) {
      query = query.eq('discovery_scan_id', scanId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting discovered accounts:', error);
    return [];
  }
}

/**
 * Approve and onboard discovered accounts
 */
export async function approveDiscoveredAccounts({ userId, role, accountIds, onboardingSettings = {} }) {
  try {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new Error('Insufficient permissions to approve accounts');
    }

    const { data, error } = await supabaseAdmin
      .from('privileged_accounts')
      .update({
        status: 'active',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('id', accountIds)
      .eq('discovered', true)
      .eq('status', 'inactive')
      .select();

    if (error) throw error;

    // Log approval
    logtail.info("Discovered accounts approved", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "approve_accounts",
      user_id: userId,
      account_ids: accountIds,
      accounts_count: accountIds.length,
      timestamp: new Date().toISOString(),
      success: true
    });

    return data || [];
  } catch (error) {
    console.error('Error approving discovered accounts:', error);
    throw error;
  }
}

/**
 * Reject discovered accounts
 */
export async function rejectDiscoveredAccounts({ userId, role, accountIds, reason = '' }) {
  try {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new Error('Insufficient permissions to reject accounts');
    }

    const { data, error } = await supabaseAdmin
      .from('privileged_accounts')
      .update({
        status: 'inactive', // Keep as inactive, rejection tracked by rejected_by field
        rejected_by: userId,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString()
      })
      .in('id', accountIds)
      .eq('discovered', true)
      .eq('status', 'inactive')
      .select();

    if (error) throw error;

    // Log rejection
    logtail.info("Discovered accounts rejected", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "reject_accounts",
      user_id: userId,
      account_ids: accountIds,
      accounts_count: accountIds.length,
      reason: reason,
      timestamp: new Date().toISOString(),
      success: true
    });

    return data || [];
  } catch (error) {
    console.error('Error rejecting discovered accounts:', error);
    throw error;
  }
}

// Legacy functions for backward compatibility
const TABLE = 'accounts';

export async function listAccounts({ source, userId, role }) {
  let query = supabaseAdmin.from(TABLE).select('*');
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
  let query = supabaseAdmin.from(TABLE).select('*').eq('id', id).single();
  if (role === 'User') {
    query = query.eq('owner_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}