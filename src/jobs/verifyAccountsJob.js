import cron from 'node-cron';
import * as accountService from '../services/accountService.js';
import * as credentialService from '../services/credentialService.js';
import * as jitService from '../services/jitService.js';
import logger from '../utils/logger.js';
import { CPMService } from '../cpm/services/CPMService.js';
import { CPMConfig } from '../cpm/config/cpmConfig.js';

class VerifyAccountsJob {
  constructor() {
    this.isRunning = false;
    this.config = CPMConfig.getInstance();
    this.cpmService = null;
  }

  // Run account verification every 10 minutes
  start() {
    logger.info('Starting account verification job scheduler...');
    
    // Initialize CPM service
    this.cpmService = new CPMService(this.config);
    
    // Schedule verification every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
      if (this.isRunning) {
        logger.warn('Account verification job already running, skipping this execution');
        return;
      }
      
      try {
        this.isRunning = true;
        await this.executeAccountVerification();
      } catch (error) {
        logger.error('Account verification job failed:', error);
      } finally {
        this.isRunning = false;
      }
    });

    // Also run a comprehensive check every hour
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running hourly comprehensive account verification');
        await this.executeComprehensiveVerification();
      } catch (error) {
        logger.error('Comprehensive account verification failed:', error);
      }
    });

    // Run JIT session account verification every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        logger.info('Running JIT session account verification');
        await this.verifyJITSessionAccounts();
      } catch (error) {
        logger.error('JIT session account verification failed:', error);
      }
    });

    logger.info('Account verification job scheduler started successfully');
  }

  async executeAccountVerification() {
    logger.info('🔍 Starting account verification scan...');
    
    try {
      // Step 1: Find all accounts with status = 'pending' or need verification
      const pendingAccounts = await this.findAccountsNeedingVerification();
      
      if (pendingAccounts.length === 0) {
        logger.info('📭 No accounts require verification');
        return { success: true, processedCount: 0 };
      }
      
      logger.info(`📊 Found ${pendingAccounts.length} accounts requiring verification`);
      
      // Step 2: Process each account
      let successCount = 0;
      let failureCount = 0;
      
      for (const account of pendingAccounts) {
        try {
          await this.verifyAccount(account);
          successCount++;
          logger.info(`✅ Account verified successfully: ${account.id} (${account.username}@${account.hostname_ip})`);
        } catch (error) {
          failureCount++;
          logger.error(`❌ Account verification failed: ${account.id} - ${error.message}`);
          await this.markAccountAsFailed(account.id, error.message);
        }
      }
      
      logger.info(`🎯 Account verification completed: ${successCount} success, ${failureCount} failed`);
      
      return { 
        success: true, 
        processedCount: pendingAccounts.length,
        successCount,
        failureCount 
      };
      
    } catch (error) {
      logger.error('Account verification scan failed:', error);
      throw error;
    }
  }

  async findAccountsNeedingVerification() {
    try {
      // Find accounts that need verification:
      // 1. status = 'pending' (never verified)
      // 2. No validation in last 24 hours and status != 'failed'
      // 3. status = 'active' but last_validated_at is old
      
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const accounts = await accountService.findAccountsForVerification({
        statuses: ['pending', 'active'],
        lastValidatedBefore: oneDayAgo,
        limit: this.config.get('batchSize') || 10
      });
      
      return accounts;
    } catch (error) {
      logger.error('Failed to find accounts needing verification:', error);
      throw error;
    }
  }

  async verifyAccount(account) {
    logger.debug(`Starting verification for account: ${account.id} (${account.username}@${account.hostname_ip})`);
    
    try {
      // Step 1: Find linked credential for this account
      const credential = await this.findLinkedCredential(account);
      if (!credential) {
        throw new Error('No linked credential found for account verification');
      }
      
      logger.debug(`Found linked credential: ${credential.id} (type: ${credential.type})`);
      
      // Step 2: Create verification task that checks if the account exists on the target system
      const verificationData = {
        ...credential,
        verification_type: 'account_existence',
        target_username: account.username,
        target_hostname: account.hostname_ip
      };
      
      // Step 3: Perform verification using CPM verifiers
      const result = await this.cpmService.verifyAccountExistence(verificationData);
      
      // Step 4: Update account status based on result
      if (result.verificationResult.success) {
        await this.markAccountAsVerified(account.id, result);
        
        // Log audit trail
        await this.logAccountVerification(account, 'verified', result.verificationResult.message);
      } else {
        await this.markAccountAsFailed(account.id, result.verificationResult.message);
        
        // Log audit trail
        await this.logAccountVerification(account, 'failed', result.verificationResult.message);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`Account verification failed for ${account.id}:`, error);
      throw error;
    }
  }

  async findLinkedCredential(account) {
    try {
      // Strategy 1: Find credential with same hostname and username
      let credentials = await credentialService.findCredentialsByHostAndUser({
        host: account.hostname_ip,
        username: account.username,
        ownerId: account.owner_id
      });
      
      if (credentials.length > 0) {
        return credentials[0]; // Use first matching credential
      }
      
      // Strategy 2: Find credential with same hostname (any username)
      credentials = await credentialService.findCredentialsByHost({
        host: account.hostname_ip,
        ownerId: account.owner_id
      });
      
      if (credentials.length > 0) {
        // Prefer credentials with administrative privileges
        const adminCredential = credentials.find(c => 
          c.username?.toLowerCase().includes('admin') || 
          c.username?.toLowerCase().includes('root') ||
          c.username?.toLowerCase().includes('administrator')
        );
        return adminCredential || credentials[0];
      }
      
      // Strategy 3: Find any credential owned by the same user
      credentials = await credentialService.getCredentials({
        userId: account.owner_id,
        role: 'User' // Get user's own credentials
      });
      
      if (credentials.length > 0) {
        // Return the first available credential as fallback
        logger.warn(`No exact credential match for account ${account.id}, using fallback credential`);
        return credentials[0];
      }
      
      return null;
      
    } catch (error) {
      logger.error('Failed to find linked credential:', error);
      throw error;
    }
  }

  async markAccountAsVerified(accountId, verificationResult) {
    try {
      await accountService.updateAccountVerificationStatus({
        accountId,
        status: 'verified',
        verifiedAt: new Date().toISOString(),
        verificationMessage: verificationResult.verificationResult.message,
        durationMs: verificationResult.duration
      });
    } catch (error) {
      logger.error('Failed to mark account as verified:', error);
    }
  }

  async markAccountAsFailed(accountId, errorMessage) {
    try {
      await accountService.updateAccountVerificationStatus({
        accountId,
        status: 'failed',
        verificationMessage: errorMessage,
        lastAttemptAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to mark account as failed:', error);
    }
  }

  async logAccountVerification(account, status, message) {
    try {
      // Check if this account is associated with any active JIT sessions
      const jitContext = await this.getJITContextForAccount(account);
      
      const metadata = {
        account_username: account.username,
        account_hostname: account.hostname_ip,
        verification_status: status,
        verification_message: message,
        system_type: account.system_type
      };
      
      // Add JIT context if available
      if (jitContext) {
        metadata.associated_jit_sessions = jitContext.activeSessions;
        metadata.jit_session_count = jitContext.sessionCount;
        metadata.verification_triggered_by = 'regular_scan_with_jit_context';
      }
      
      await accountService.createAuditLog({
        userId: 'system', // System-generated verification
        action: 'account_verification',
        resource: `account:${account.id}`,
        metadata
      });
    } catch (error) {
      logger.error('Failed to create audit log:', error);
    }
  }

  async getJITContextForAccount(account) {
    try {
      // Get active JIT sessions for this account's owner
      const activeSessions = await jitService.listActiveSessions({ 
        userId: account.owner_id, 
        role: 'User' 
      });
      
      if (activeSessions.length === 0) {
        return null;
      }
      
      // Filter sessions that might be related to this account
      const relatedSessions = activeSessions.filter(session => {
        const resourceIdentifier = session.resource?.split(':')[1] || session.resource;
        const systemMatch = session.system?.toLowerCase() === account.system_type?.toLowerCase();
        const hostnameMatch = resourceIdentifier === account.hostname_ip;
        
        return systemMatch || hostnameMatch;
      });
      
      if (relatedSessions.length === 0) {
        return null;
      }
      
      return {
        sessionCount: relatedSessions.length,
        activeSessions: relatedSessions.map(session => ({
          id: session.id,
          resource: session.resource,
          system: session.system,
          expires_at: session.expires_at
        }))
      };
      
    } catch (error) {
      logger.error('Failed to get JIT context for account:', error);
      return null;
    }
  }

  async executeComprehensiveVerification() {
    logger.info('🔄 Running comprehensive account verification');
    
    try {
      // Get statistics before verification
      const statsBefore = await accountService.getAccountVerificationStatistics();
      
      // Run normal verification
      const result = await this.executeAccountVerification();
      
      // Get statistics after verification
      const statsAfter = await accountService.getAccountVerificationStatistics();
      
      logger.info('📊 Comprehensive verification completed', {
        processed: result.processedCount,
        success: result.successCount,
        failed: result.failureCount,
        before: statsBefore,
        after: statsAfter
      });
      
      return { success: true, result, statsBefore, statsAfter };
      
    } catch (error) {
      logger.error('Comprehensive verification failed:', error);
      throw error;
    }
  }

  // Manual trigger for testing
  async runManualVerification() {
    if (this.isRunning) {
      throw new Error('Account verification job is already running');
    }
    
    try {
      this.isRunning = true;
      return await this.executeAccountVerification();
    } finally {
      this.isRunning = false;
    }
  }

  // Verify a specific account manually
  async verifySpecificAccount(accountId) {
    try {
      const account = await accountService.getAccountById({ 
        id: accountId, 
        ownerId: null, // System operation, bypass ownership check
        role: 'Admin' 
      });
      
      if (!account) {
        throw new Error('Account not found');
      }
      
      return await this.verifyAccount(account);
      
    } catch (error) {
      logger.error(`Manual account verification failed for ${accountId}:`, error);
      throw error;
    }
  }

  // Verify accounts associated with active JIT sessions
  async verifyJITSessionAccounts() {
    logger.info('🔐 Starting JIT session account verification...');
    
    try {
      // Step 1: Get all active JIT sessions
      const activeSessions = await jitService.listActiveSessions({ 
        userId: null, // Get all sessions
        role: 'Admin' 
      });
      
      if (activeSessions.length === 0) {
        logger.info('📭 No active JIT sessions require account verification');
        return { success: true, processedCount: 0 };
      }
      
      logger.info(`🎯 Found ${activeSessions.length} active JIT sessions requiring account verification`);
      
      // Step 2: Extract unique resource identifiers and find associated accounts
      const jitAccounts = await this.findAccountsForJITSessions(activeSessions);
      
      if (jitAccounts.length === 0) {
        logger.info('📭 No accounts found for active JIT sessions');
        return { success: true, processedCount: 0 };
      }
      
      logger.info(`📊 Found ${jitAccounts.length} accounts associated with JIT sessions`);
      
      // Step 3: Verify each JIT account
      let successCount = 0;
      let failureCount = 0;
      
      for (const { account, jitSession } of jitAccounts) {
        try {
          const result = await this.verifyJITAccount(account, jitSession);
          successCount++;
          logger.info(`✅ JIT account verified: ${account.id} (${account.username}@${account.hostname_ip}) for session ${jitSession.id}`);
        } catch (error) {
          failureCount++;
          logger.error(`❌ JIT account verification failed: ${account.id} - ${error.message}`);
          await this.handleJITVerificationFailure(account, jitSession, error.message);
        }
      }
      
      logger.info(`🎯 JIT session account verification completed: ${successCount} success, ${failureCount} failed`);
      
      return { 
        success: true, 
        processedCount: jitAccounts.length,
        successCount,
        failureCount,
        activeSessions: activeSessions.length
      };
      
    } catch (error) {
      logger.error('JIT session account verification failed:', error);
      throw error;
    }
  }

  async findAccountsForJITSessions(jitSessions) {
    const jitAccounts = [];
    
    for (const jitSession of jitSessions) {
      try {
        // Parse resource identifier from JIT session
        // Resource could be: "server:hostname", "database:hostname", "account:id", etc.
        const { resource, system } = jitSession;
        
        if (!resource || !system) {
          logger.warn(`JIT session ${jitSession.id} missing resource or system information`);
          continue;
        }
        
        // Find accounts matching the JIT session resource
        let accounts = [];
        
        if (resource.startsWith('account:')) {
          // Direct account reference
          const accountId = resource.split(':')[1];
          const account = await accountService.getAccountById({ 
            id: accountId, 
            ownerId: null, 
            role: 'Admin' 
          });
          if (account) accounts = [account];
        } else {
          // Resource-based matching (hostname, system type, etc.)
          const resourceIdentifier = resource.split(':')[1] || resource;
          accounts = await this.findAccountsByResource(resourceIdentifier, system, jitSession.user_id);
        }
        
        // Add accounts with their associated JIT session
        for (const account of accounts) {
          jitAccounts.push({ account, jitSession });
        }
        
      } catch (error) {
        logger.error(`Failed to find accounts for JIT session ${jitSession.id}:`, error);
      }
    }
    
    return jitAccounts;
  }

  async findAccountsByResource(resourceIdentifier, systemType, userId) {
    try {
      // Find accounts by hostname/IP and system type
      const accounts = await accountService.findAccountsForVerification({
        statuses: ['pending', 'active', 'verified'], // Include all statuses for JIT
        limit: 50 // Higher limit for JIT verification
      });
      
      // Filter accounts that match the resource identifier
      return accounts.filter(account => {
        const hostnameMatch = account.hostname_ip === resourceIdentifier;
        const systemMatch = systemType ? account.system_type?.toLowerCase() === systemType.toLowerCase() : true;
        const userMatch = account.owner_id === userId; // JIT sessions are user-specific
        
        return hostnameMatch && systemMatch && userMatch;
      });
      
    } catch (error) {
      logger.error('Failed to find accounts by resource:', error);
      return [];
    }
  }

  async verifyJITAccount(account, jitSession) {
    logger.debug(`Starting JIT account verification: ${account.id} for session ${jitSession.id}`);
    
    try {
      // Step 1: Find linked credential for this account
      const credential = await this.findLinkedCredential(account);
      if (!credential) {
        throw new Error('No linked credential found for JIT account verification');
      }
      
      // Step 2: Create enhanced verification data with JIT context
      const verificationData = {
        ...credential,
        verification_type: 'jit_account_existence',
        target_username: account.username,
        target_hostname: account.hostname_ip,
        jit_session_id: jitSession.id,
        jit_user_id: jitSession.user_id,
        jit_resource: jitSession.resource,
        jit_expires_at: jitSession.expires_at
      };
      
      // Step 3: Perform verification using CPM verifiers
      const result = await this.cpmService.verifyAccountExistence(verificationData);
      
      // Step 4: Update account status and JIT-specific logging
      if (result.verificationResult.success) {
        await this.markAccountAsVerified(account.id, result);
        await this.logJITAccountVerification(account, jitSession, 'verified', result.verificationResult.message);
      } else {
        await this.markAccountAsFailed(account.id, result.verificationResult.message);
        await this.logJITAccountVerification(account, jitSession, 'failed', result.verificationResult.message);
      }
      
      return result;
      
    } catch (error) {
      logger.error(`JIT account verification failed for ${account.id}:`, error);
      throw error;
    }
  }

  async handleJITVerificationFailure(account, jitSession, errorMessage) {
    try {
      // Log the failure with JIT context
      await this.logJITAccountVerification(account, jitSession, 'verification_failed', errorMessage);
      
      // Optionally: Consider revoking JIT session if account verification fails critically
      const criticalErrors = ['authentication', 'permission_denied', 'account_not_found'];
      const isCritical = criticalErrors.some(error => errorMessage.toLowerCase().includes(error));
      
      if (isCritical) {
        logger.warn(`Critical verification failure for JIT session ${jitSession.id}, considering session revocation`);
        
        // Log security event for manual review
        await accountService.createAuditLog({
          userId: 'system',
          action: 'jit_critical_verification_failure',
          resource: `jit_session:${jitSession.id}`,
          metadata: {
            account_id: account.id,
            account_username: account.username,
            account_hostname: account.hostname_ip,
            jit_session_id: jitSession.id,
            jit_user_id: jitSession.user_id,
            jit_resource: jitSession.resource,
            error_message: errorMessage,
            recommended_action: 'manual_review_required'
          }
        });
      }
      
    } catch (error) {
      logger.error('Failed to handle JIT verification failure:', error);
    }
  }

  async logJITAccountVerification(account, jitSession, status, message) {
    try {
      await accountService.createAuditLog({
        userId: jitSession.user_id, // Associate with JIT session user
        action: 'jit_account_verification',
        resource: `account:${account.id}`,
        metadata: {
          account_username: account.username,
          account_hostname: account.hostname_ip,
          verification_status: status,
          verification_message: message,
          system_type: account.system_type,
          jit_session_id: jitSession.id,
          jit_resource: jitSession.resource,
          jit_expires_at: jitSession.expires_at,
          jit_business_justification: jitSession.business_justification
        }
      });
    } catch (error) {
      logger.error('Failed to create JIT audit log:', error);
    }
  }
}

export default new VerifyAccountsJob();