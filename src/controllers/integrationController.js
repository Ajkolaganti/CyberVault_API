import * as integrationService from '../services/integrationService.js';

export async function list(req, res, next) {
  try {
    const integrations = await integrationService.listIntegrations();
    res.json(integrations);
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const integration = await integrationService.createIntegration(req.body);
    res.status(201).json(integration);
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const updated = await integrationService.updateIntegration(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await integrationService.deleteIntegration(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
} 