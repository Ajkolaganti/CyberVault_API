import * as safeService from '../services/safeService.js';

export async function create(req, res, next) {
  try {
    const { name, description, safe_type, access_level, settings } = req.body;
    const safe = await safeService.createSafe({
      name,
      description,
      ownerId: req.user.id,
      safe_type,
      access_level,
      settings
    });
    res.status(201).json(safe);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { safe_type, access_level, status, limit, offset } = req.query;
    const safes = await safeService.listSafes({
      ownerId: req.user.id,
      role: req.user.role,
      safe_type,
      access_level,
      status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    res.json(safes);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const safe = await safeService.getSafeById({
      id: req.params.id,
      ownerId: req.user.id,
      role: req.user.role
    });
    res.json(safe);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const updates = req.body;
    const safe = await safeService.updateSafe({
      id: req.params.id,
      ownerId: req.user.id,
      role: req.user.role,
      updates
    });
    res.json(safe);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await safeService.deleteSafe({
      id: req.params.id,
      ownerId: req.user.id,
      role: req.user.role
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function grantPermission(req, res, next) {
  try {
    const { userId, permission_level } = req.body;
    const permission = await safeService.grantPermission({
      safeId: req.params.id,
      userId,
      permission_level,
      granted_by: req.user.id
    });
    res.json(permission);
  } catch (err) {
    next(err);
  }
}

export async function revokePermission(req, res, next) {
  try {
    await safeService.revokePermission({
      permissionId: req.params.permissionId,
      ownerId: req.user.id,
      role: req.user.role
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function listActivity(req, res, next) {
  try {
    const activities = await safeService.listActivityLog(req.params.id);
    res.json(activities);
  } catch (err) {
    next(err);
  }
}

export async function listPermissions(req, res, next) {
  try {
    const permissions = await safeService.listSafePermissions(req.params.id);
    res.json(permissions);
  } catch (err) {
    next(err);
  }
}

export async function listAccounts(req, res, next) {
  try {
    const accounts = await safeService.getSafeAccounts(req.params.id, {
      ownerId: req.user.id,
      role: req.user.role
    });
    res.json(accounts);
  } catch (err) {
    next(err);
  }
}

export async function statistics(req, res, next) {
  try {
    const stats = await safeService.getSafeStatistics({
      ownerId: req.user.id,
      role: req.user.role
    });
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

export async function moveAccounts(req, res, next) {
  try {
    const { sourceId, targetId, accountIds } = req.body;
    const result = await safeService.moveSafeAccounts({
      sourceId,
      targetId,
      accountIds,
      ownerId: req.user.id,
      role: req.user.role
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

