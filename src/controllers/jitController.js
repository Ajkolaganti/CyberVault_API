import * as jitService from '../services/jitService.js';

export async function request(req, res, next) {
  try {
    const { resource, durationMinutes } = req.body;
    const session = await jitService.requestJITAccess({
      userId: req.user.id,
      resource,
      durationMinutes: durationMinutes || 60, // default 1hr
    });
    res.status(201).json(session);
  } catch (err) {
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