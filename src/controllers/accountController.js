import * as accountService from '../services/accountService.js';

export async function create(req, res, next) {
  try {
    const { system_type, hostname_ip, username, password, rotation_policy } = req.body;
    const account = await accountService.createAccount({
      ownerId: req.user.id,
      system_type,
      hostname_ip,
      username,
      password,
      rotation_policy
    });
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const accounts = await accountService.listAccounts({
      ownerId: req.user.id,
      role: req.user.role
    });
    res.json(accounts);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const account = await accountService.getAccountById({
      id: req.params.id,
      ownerId: req.user.id,
      role: req.user.role
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const account = await accountService.updateAccount({
      id: req.params.id,
      ownerId: req.user.id,
      role: req.user.role,
      updates: req.body
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await accountService.deleteAccount({
      id: req.params.id,
      ownerId: req.user.id,
      role: req.user.role
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function rotatePassword(req, res, next) {
  try {
    const account = await accountService.rotateAccountPassword({
      id: req.params.id,
      ownerId: req.user.id,
      role: req.user.role
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
}

export async function rotationHistory(req, res, next) {
  try {
    const history = await accountService.listRotationHistory(req.params.id);
    res.json(history);
  } catch (err) {
    next(err);
  }
}
