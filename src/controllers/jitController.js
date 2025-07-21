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
    const sessions = await jitService.listActiveSessions({
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(sessions);
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