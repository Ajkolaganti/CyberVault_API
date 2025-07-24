import * as discoveryService from '../services/discoveryService.js';
import { logtail } from '../utils/logger.js';

// Discovery Targets Management
export async function createTarget(req, res, next) {
  try {
    const { targetType, hostname, connectionMethod, credentialId, name, description, settings } = req.body;
    
    // Validate required fields
    if (!targetType || !hostname || !connectionMethod || !credentialId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: targetType, hostname, connectionMethod, credentialId, name'
      });
    }

    const target = await discoveryService.createDiscoveryTarget({
      userId: req.user.id,
      targetType,
      hostname,
      connectionMethod,
      credentialId,
      name,
      description,
      settings: settings || {}
    });

    res.status(201).json({
      success: true,
      data: target
    });
  } catch (err) {
    next(err);
  }
}

export async function listTargets(req, res, next) {
  try {
    const targets = await discoveryService.getDiscoveryTargets({
      userId: req.user.id,
      role: req.user.role
    });

    res.json({
      success: true,
      data: targets,
      count: targets.length
    });
  } catch (err) {
    next(err);
  }
}

export async function getTargetById(req, res, next) {
  try {
    const targets = await discoveryService.getDiscoveryTargets({
      userId: req.user.id,
      role: req.user.role
    });
    
    const target = targets.find(t => t.id === req.params.id);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'Discovery target not found'
      });
    }

    res.json({
      success: true,
      data: target
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTarget(req, res, next) {
  try {
    const { name, description, targetType, hostname, connectionMethod, credentialId, settings } = req.body;

    const updatedTarget = await discoveryService.updateDiscoveryTarget({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      updates: {
        name,
        description,
        target_type: targetType,
        hostname,
        connection_method: connectionMethod,
        credential_id: credentialId,
        settings: settings || {}
      }
    });

    // Log target update
    logtail.info("Discovery target updated via API", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "api_update_target",
      user_id: req.user.id,
      user_role: req.user.role,
      target_id: req.params.id,
      updated_fields: Object.keys(req.body),
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json({
      success: true,
      data: updatedTarget,
      message: 'Discovery target updated successfully'
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteTarget(req, res, next) {
  try {
    const deletedTarget = await discoveryService.deleteDiscoveryTarget({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role
    });

    // Log target deletion
    logtail.warn("Discovery target deleted via API", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "api_delete_target",
      user_id: req.user.id,
      user_role: req.user.role,
      target_id: req.params.id,
      target_name: deletedTarget.name,
      target_hostname: deletedTarget.hostname,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json({
      success: true,
      data: deletedTarget,
      message: 'Discovery target deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// Discovery Scans Management
export async function initiateDiscoveryScan(req, res, next) {
  try {
    const { targetId } = req.params;
    const { scanSettings } = req.body;

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: 'Target ID is required'
      });
    }

    const scan = await discoveryService.initiateDiscoveryScan({
      targetId,
      userId: req.user.id,
      scanSettings: scanSettings || {}
    });

    // Log scan initiation
    logtail.info("Discovery scan initiated via API", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "api_initiate_scan",
      user_id: req.user.id,
      user_role: req.user.role,
      target_id: targetId,
      scan_id: scan.id,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.status(201).json({
      success: true,
      data: scan,
      message: 'Discovery scan initiated successfully'
    });
  } catch (err) {
    next(err);
  }
}

export async function listScans(req, res, next) {
  try {
    const { targetId, limit = 50, offset = 0 } = req.query;

    const scans = await discoveryService.getDiscoveryScans({
      userId: req.user.id,
      role: req.user.role,
      targetId: targetId || null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Enhance scan data with better error details
    const enhancedScans = scans.map(scan => {
      if (scan.status === 'failed' && scan.metadata?.error_message) {
        // Parse error details if available
        try {
          let errorDetails = scan.metadata.error_message;
          if (errorDetails.includes('Details: {')) {
            const detailsStart = errorDetails.indexOf('Details: {');
            const detailsJson = errorDetails.substring(detailsStart + 9);
            try {
              const parsedDetails = JSON.parse(detailsJson);
              scan.error_details = parsedDetails;
              scan.friendly_error = getFriendlyErrorMessage(errorDetails, parsedDetails);
            } catch (parseError) {
              scan.friendly_error = getSimplifiedErrorMessage(errorDetails);
            }
          } else {
            scan.friendly_error = getSimplifiedErrorMessage(errorDetails);
          }
        } catch (e) {
          scan.friendly_error = scan.metadata.error_message;
        }
      }
      return scan;
    });

    res.json({
      success: true,
      data: enhancedScans,
      count: enhancedScans.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    next(err);
  }
}

// Helper function to create user-friendly error messages
function getFriendlyErrorMessage(errorMessage, errorDetails) {
  if (errorMessage.includes('SSH connection timeout')) {
    return 'Connection timeout - The target server is not responding. Please check if the server is online and SSH is enabled.';
  }
  
  if (errorMessage.includes('ECONNREFUSED')) {
    return 'Connection refused - SSH service is not running on the target server or is blocked by firewall.';
  }
  
  if (errorMessage.includes('Authentication failed') || errorMessage.includes('auth')) {
    return 'Authentication failed - Please check the username and password in the selected credential.';
  }
  
  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('host not found')) {
    return 'Host not found - Please check the hostname or IP address.';
  }
  
  if (errorMessage.includes('No credential provided')) {
    return 'Missing credential - Please select a valid credential for this discovery target.';
  }
  
  if (errorMessage.includes('Credential does not contain password')) {
    return 'Invalid credential - The selected credential does not contain a password or value field.';
  }
  
  if (errorMessage.includes('No accounts discovered')) {
    return 'No user accounts found - The system may not have any user accounts, or the commands failed to execute.';
  }
  
  return getSimplifiedErrorMessage(errorMessage);
}

function getSimplifiedErrorMessage(errorMessage) {
  // Extract the main error without stack traces and details
  const mainError = errorMessage.split('.')[0];
  return mainError.length > 100 ? mainError.substring(0, 100) + '...' : mainError;
}

export async function getScanById(req, res, next) {
  try {
    const { scanId } = req.params;

    const scans = await discoveryService.getDiscoveryScans({
      userId: req.user.id,
      role: req.user.role,
      limit: 1000 // Get all to find the specific one
    });

    const scan = scans.find(s => s.id === scanId);
    if (!scan) {
      return res.status(404).json({
        success: false,
        message: 'Discovery scan not found'
      });
    }

    res.json({
      success: true,
      data: scan
    });
  } catch (err) {
    next(err);
  }
}

// Discovered Accounts Management
export async function listDiscoveredAccounts(req, res, next) {
  try {
    const { scanId, status = 'inactive' } = req.query;

    const accounts = await discoveryService.getDiscoveredAccounts({
      userId: req.user.id,
      role: req.user.role,
      scanId: scanId || null,
      status
    });

    res.json({
      success: true,
      data: accounts,
      count: accounts.length
    });
  } catch (err) {
    next(err);
  }
}

export async function approveDiscoveredAccounts(req, res, next) {
  try {
    const { accountIds, onboardingSettings } = req.body;

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Account IDs array is required'
      });
    }

    const approvedAccounts = await discoveryService.approveDiscoveredAccounts({
      userId: req.user.id,
      role: req.user.role,
      accountIds,
      onboardingSettings: onboardingSettings || {}
    });

    // Log approval action
    logtail.info("Discovered accounts approved via API", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "api_approve_accounts",
      user_id: req.user.id,
      user_role: req.user.role,
      account_ids: accountIds,
      accounts_count: accountIds.length,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json({
      success: true,
      data: approvedAccounts,
      message: `${approvedAccounts.length} accounts approved successfully`
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectDiscoveredAccounts(req, res, next) {
  try {
    const { accountIds, reason } = req.body;

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Account IDs array is required'
      });
    }

    const rejectedAccounts = await discoveryService.rejectDiscoveredAccounts({
      userId: req.user.id,
      role: req.user.role,
      accountIds,
      reason: reason || 'No reason provided'
    });

    // Log rejection action
    logtail.info("Discovered accounts rejected via API", {
      app_name: "CyberVault API",
      type: "discovery_event",
      action: "api_reject_accounts",
      user_id: req.user.id,
      user_role: req.user.role,
      account_ids: accountIds,
      accounts_count: accountIds.length,
      rejection_reason: reason,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json({
      success: true,
      data: rejectedAccounts,
      message: `${rejectedAccounts.length} accounts rejected successfully`
    });
  } catch (err) {
    next(err);
  }
}

// Discovery Statistics
export async function getDiscoveryStatistics(req, res, next) {
  try {
    const { range = '30d' } = req.query;

    // Get discovery targets count
    const targets = await discoveryService.getDiscoveryTargets({
      userId: req.user.id,
      role: req.user.role
    });

    // Get recent scans
    const scans = await discoveryService.getDiscoveryScans({
      userId: req.user.id,
      role: req.user.role,
      limit: 1000
    });

    // Get discovered accounts
    const discoveredAccounts = await discoveryService.getDiscoveredAccounts({
      userId: req.user.id,
      role: req.user.role
    });

    // Calculate statistics
    const statistics = {
      summary: {
        totalTargets: targets.length,
        totalScans: scans.length,
        completedScans: scans.filter(s => s.status === 'completed').length,
        failedScans: scans.filter(s => s.status === 'failed').length,
        runningScans: scans.filter(s => s.status === 'running').length
      },
      discoveredAccounts: {
        total: discoveredAccounts.length,
        pendingApproval: discoveredAccounts.filter(a => a.status === 'inactive' && a.discovered === true && !a.approved_by && !a.rejected_by).length,
        approved: discoveredAccounts.filter(a => a.status === 'active').length,
        rejected: discoveredAccounts.filter(a => a.rejected_by !== null).length
      },
      systemBreakdown: {},
      recentActivity: scans.slice(0, 10)
    };

    // Group by system type
    discoveredAccounts.forEach(account => {
      const systemType = account.system_type || 'Unknown';
      if (!statistics.systemBreakdown[systemType]) {
        statistics.systemBreakdown[systemType] = 0;
      }
      statistics.systemBreakdown[systemType]++;
    });

    res.json({
      success: true,
      data: statistics
    });
  } catch (err) {
    next(err);
  }
}

// Legacy endpoints for backward compatibility
export async function list(req, res, next) {
  try {
    const { source } = req.query;
    const accounts = await discoveryService.listAccounts({
      source,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(accounts);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const account = await discoveryService.getAccountById({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
} 