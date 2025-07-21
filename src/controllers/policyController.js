import * as policyService from '../services/policyService.js';

export async function list(req, res, next) {
  try {
    const policies = await policyService.listPolicies();
    res.json(policies);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const policy = await policyService.createPolicy(req.body);
    res.status(201).json(policy);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const updated = await policyService.updatePolicy(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await policyService.deletePolicy(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
} 