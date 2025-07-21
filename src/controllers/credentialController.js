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