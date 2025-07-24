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

    res.json({
      success: true,
      data: scans,
      count: scans.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    next(err);
  }
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
    const { scanId, status = 'pending_approval' } = req.query;

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
        pendingApproval: discoveredAccounts.filter(a => a.status === 'pending_approval').length,
        approved: discoveredAccounts.filter(a => a.status === 'active').length,
        rejected: discoveredAccounts.filter(a => a.status === 'rejected').length
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