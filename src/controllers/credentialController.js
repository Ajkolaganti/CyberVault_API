import * as credentialService from '../services/credentialService.js';
import { logtail } from '../utils/logger.js';

export async function create(req, res, next) {
  try {
    const { 
      type, 
      name, 
      value, 
      password, 
      host, 
      port, 
      username,
      database_name,
      schema_name,
      connection_string,
      ssl_enabled,
      additional_params
    } = req.body;
    
    const secretValue = value || password;
    const credential = await credentialService.createCredential({
      userId: req.user.id,
      type,
      name,
      value: secretValue,
      host,
      port,
      username,
      database_name,
      schema_name,
      connection_string,
      ssl_enabled,
      additional_params
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

export async function getHistory(req, res, next) {
  try {
    const history = await credentialService.getCredentialHistory({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });

    res.json({
      success: true,
      data: history
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyCredential(req, res, next) {
  try {
    const verificationResult = await credentialService.verifyCredential({
      id: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });

    // Log verification attempt
    logtail.info("Credential verification", {
      app_name: "CyberVault API",
      type: "credential_event",
      action: "verify",
      user_id: req.user.id,
      user_role: req.user.role,
      credential_id: req.params.id,
      verification_success: verificationResult.success,
      verification_type: verificationResult.verificationType,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json({
      success: true,
      data: verificationResult
    });
  } catch (err) {
    // Log verification error
    logtail.error("Credential verification failed", {
      app_name: "CyberVault API",
      type: "credential_event",
      action: "verify_failed",
      user_id: req.user.id,
      user_role: req.user.role,
      credential_id: req.params.id,
      error_message: err.message,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: false
    });

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