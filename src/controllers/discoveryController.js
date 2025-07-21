import * as discoveryService from '../services/discoveryService.js';

export async function list(req, res, next) {
  try {
    const { source } = req.query; // windows, linux, aws, azure
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