import * as jitService from '../services/jitService.js';

export async function request(req, res, next) {
  try {
    const { resource, system, reason, durationMinutes } = req.body;
    
    // Additional validation
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Reason is required and must be a non-empty string'
      });
    }
    
    const session = await jitService.requestJITAccess({
      userId: req.user.id,
      resource,
      system,
      reason: reason.trim(),
      durationMinutes: durationMinutes || 60, // default 1hr
    });
    res.status(201).json(session);
  } catch (err) {
    // Handle specific database constraint errors
    if (err.message && err.message.includes('business_justification')) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Business justification reason is required'
      });
    }
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { status = 'active', limit = 50, offset = 0 } = req.query;
    
    let sessions;
    if (status === 'active') {
      sessions = await jitService.listActiveSessions({
        userId: req.user.id,
        role: req.user.role,
      });
    } else if (status === 'history' || status === 'expired') {
      sessions = await jitService.listSessionHistory({
        userId: req.user.id,
        role: req.user.role,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } else {
      sessions = await jitService.getAllSessions({
        userId: req.user.id,
        role: req.user.role,
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }
    
    res.json({
      data: sessions,
      count: sessions.length,
      total: sessions.length,
      status: status,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function revoke(req, res, next) {
  try {
    const session = await jitService.revokeSession({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(session);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const session = await jitService.getSessionById({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(session);
  } catch (err) {
    next(err);
  }
}

export async function extend(req, res, next) {
  try {
    const { additionalMinutes } = req.body;
    
    if (!additionalMinutes || additionalMinutes < 1 || additionalMinutes > 480) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Additional minutes must be between 1 and 480 (8 hours)'
      });
    }
    
    const session = await jitService.extendSession({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      additionalMinutes: parseInt(additionalMinutes)
    });
    
    res.json(session);
  } catch (err) {
    if (err.message.includes('expired') || err.message.includes('not found')) {
      return res.status(400).json({
        error: 'Invalid request',
        message: err.message
      });
    }
    next(err);
  }
}

export async function getStatistics(req, res, next) {
  try {
    const stats = await jitService.getJITStatistics();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

export async function manualCleanup(req, res, next) {
  try {
    // Only allow Admins to manually trigger cleanup
    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only Admins can manually trigger cleanup'
      });
    }
    
    const result = await jitService.cleanupExpiredSessions();
    const updatedCount = Array.isArray(result) ? result.length : 0;
    
    res.json({
      success: true,
      message: `Manual cleanup completed: ${updatedCount} sessions marked as expired`,
      updatedCount
    });
  } catch (err) {
    next(err);
  }
}
