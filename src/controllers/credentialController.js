import * as credentialService from '../services/credentialService.js';
import { logtail } from '../utils/logger.js';

export async function create(req, res, next) {
  try {
    const { type, name, value, password, host, port, username } = req.body;
    const secretValue = value || password;
    const credential = await credentialService.createCredential({
      userId: req.user.id,
      type,
      name,
      value: secretValue,
      host,
      port,
      username
    });

    // Log credential creation (without sensitive data)
    logtail.info("Credential created", {
      app_name: "CyberVault API",
      type: "credential_event",
      action: "create",
      user_id: req.user.id,
      user_role: req.user.role,
      credential_id: credential.id,
      credential_type: type,
      credential_name: name,
      host: host,
      username: username,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.status(201).json(credential);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    console.log('Credentials list request - User info:', {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    });
    
    const credentials = await credentialService.getCredentials({
      userId: req.user.id,
      role: req.user.role,
    });
    
    console.log(`Returning ${credentials.length} credentials to frontend`);
    
    // Send response with count for frontend compatibility
    const response = {
      data: credentials,
      count: credentials.length,
      total: credentials.length
    };
    
    console.log('Credentials response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
    console.error('Error fetching credentials:', err);
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

    // Log credential rotation/update (without sensitive data)
    logtail.info("Credential rotated/updated", {
      app_name: "CyberVault API",
      type: "credential_event",
      action: "rotate",
      user_id: req.user.id,
      user_role: req.user.role,
      credential_id: req.params.id,
      credential_name: credential.name,
      updated_fields: Object.keys(req.body),
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json(credential);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const deletedCredential = await credentialService.deleteCredential({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });

    // Log credential deletion
    logtail.warn("Credential deleted", {
      app_name: "CyberVault API",
      type: "credential_event",
      action: "delete",
      user_id: req.user.id,
      user_role: req.user.role,
      credential_id: req.params.id,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
} 