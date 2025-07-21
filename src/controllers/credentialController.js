import * as credentialService from '../services/credentialService.js';

export async function create(req, res, next) {
  try {
    const { type, name, value, password } = req.body;
    const secretValue = value || password;
    const credential = await credentialService.createCredential({
      userId: req.user.id,
      type,
      name,
      value: secretValue,
    });
    res.status(201).json(credential);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const credentials = await credentialService.getCredentials({
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(credentials);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const credential = await credentialService.getCredentialById({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.json(credential);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const credential = await credentialService.updateCredential({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      updates: req.body,
    });
    res.json(credential);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await credentialService.deleteCredential({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
} 