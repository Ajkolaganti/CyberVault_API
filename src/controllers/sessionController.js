import * as sessionService from '../services/sessionService.js';

export async function start(req, res, next) {
  try {
    const { target } = req.body;
    const session = await sessionService.startSession({
      userId: req.user.id,
      target,
    });
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

export async function end(req, res, next) {
  try {
    const session = await sessionService.endSession({
      sessionId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(session);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const sessions = await sessionService.listSessions({
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(sessions);
  } catch (err) {
    next(err);
  }
}

export async function postLog(req, res, next) {
  try {
    const { message } = req.body;
    const log = await sessionService.addLog({
      sessionId: req.params.id,
      message,
    });
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
}

export async function getLogs(req, res, next) {
  try {
    const logs = await sessionService.getLogs({ sessionId: req.params.id });
    res.json(logs);
  } catch (err) {
    next(err);
  }
} 