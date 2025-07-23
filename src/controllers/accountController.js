import * as accountService from '../services/accountService.js';

export async function create(req, res, next) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  try {
    console.log(`[${requestId}] === Account Creation Request ===`);
    console.log(`[${requestId}] User:`, {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    });
    
    // Map frontend field names to backend field names
    const hostname_ip = req.body.hostname_ip || req.body.hostname;
    const safe_id = req.body.safe_id || (req.body.safe_name ? null : undefined); // safe_name needs to be converted to UUID
    
    console.log(`[${requestId}] Request body received:`, {
      name: req.body.name,
      system_type: req.body.system_type,
      hostname: req.body.hostname,
      hostname_ip: hostname_ip,
      port: req.body.port,
      username: req.body.username,
      password_provided: req.body.password ? 'YES' : 'NO',
      connection_method: req.body.connection_method,
      platform_id: req.body.platform_id,
      account_type: req.body.account_type,
      safe_name: req.body.safe_name,
      safe_id: safe_id,
      rotation_policy_provided: req.body.rotation_policy ? 'YES' : 'NO'
    });
    
    // Validate required fields at controller level (handle both frontend and backend field names)
    const requiredFields = [
      { field: 'system_type', value: req.body.system_type },
      { field: 'hostname/hostname_ip', value: hostname_ip },
      { field: 'username', value: req.body.username },
      { field: 'password', value: req.body.password }
    ];
    const missingFields = requiredFields.filter(item => !item.value).map(item => item.field);
    
    if (missingFields.length > 0) {
      console.log(`[${requestId}] ❌ Missing required fields:`, missingFields);
      return res.status(400).json({
        error: 'Validation failed',
        message: `Missing required fields: ${missingFields.join(', ')}`,
        details: missingFields.map(field => ({
          field,
          message: `${field} is required`
        }))
      });
    }
    
    // Validate field lengths
    if (hostname_ip && hostname_ip.length > 255) {
      console.log(`[${requestId}] ❌ Hostname/IP too long:`, hostname_ip.length);
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Hostname/IP must be 255 characters or less'
      });
    }
    
    if (req.body.username && req.body.username.length > 100) {
      console.log(`[${requestId}] ❌ Username too long:`, req.body.username.length);
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Username must be 100 characters or less'
      });
    }
    
    // Validate port number
    if (req.body.port && (req.body.port < 1 || req.body.port > 65535)) {
      console.log(`[${requestId}] ❌ Invalid port number:`, req.body.port);
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Port must be between 1 and 65535'
      });
    }
    
    console.log(`[${requestId}] ✓ Controller validation passed`);
    
    // Handle safe_name to safe_id conversion if needed
    let finalSafeId = safe_id;
    if (req.body.safe_name && !safe_id) {
      console.log(`[${requestId}] Looking up safe by name: ${req.body.safe_name}`);
      try {
        const { data: safeData } = await require('../utils/supabaseClient.js').default
          .from('safes')
          .select('id')
          .eq('name', req.body.safe_name)
          .single();
        finalSafeId = safeData?.id;
        console.log(`[${requestId}] Found safe ID: ${finalSafeId}`);
      } catch (error) {
        console.log(`[${requestId}] ❌ Safe not found: ${req.body.safe_name}`);
        return res.status(400).json({
          error: 'Validation failed',
          message: `Safe with name '${req.body.safe_name}' not found`
        });
      }
    }
    
    const { name, system_type, port, username, password, connection_method, platform_id, account_type, rotation_policy } = req.body;
    
    console.log(`[${requestId}] Calling account service...`);
    const account = await accountService.createAccount({
      ownerId: req.user.id,
      name,
      system_type,
      hostname_ip,
      port,
      username,
      password,
      connection_method,
      platform_id,
      account_type,
      rotation_policy,
      safe_id: finalSafeId
    });
    
    console.log(`[${requestId}] ✓ Account created successfully:`, account.id);
    
    // Remove sensitive data from response
    const responseAccount = {
      ...account,
      encrypted_password: undefined // Don't send encrypted password in response
    };
    
    console.log(`[${requestId}] === Account Creation Completed ===`);
    res.status(201).json(responseAccount);
    
  } catch (err) {
    console.error(`[${requestId}] === Account Creation Failed ===`);
    console.error(`[${requestId}] Error type:`, err.constructor.name);
    console.error(`[${requestId}] Error message:`, err.message);
    
    if (err.stack) {
      console.error(`[${requestId}] Stack trace:`, err.stack);
    }
    
    // Provide user-friendly error responses
    if (err.message.includes('Owner ID is required')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to create accounts'
      });
    }
    
    if (err.message.includes('required')) {
      return res.status(400).json({
        error: 'Validation failed',
        message: err.message
      });
    }
    
    if (err.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Conflict',
        message: err.message
      });
    }
    
    if (err.message.includes('does not exist')) {
      return res.status(404).json({
        error: 'Resource not found',
        message: err.message
      });
    }
    
    if (err.message.includes('Invalid value')) {
      return res.status(400).json({
        error: 'Invalid input',
        message: err.message
      });
    }
    
    console.error(`[${requestId}] === Passing error to next middleware ===`);
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { system_type, status, safe_id, limit, offset } = req.query;
    const accounts = await accountService.listAccounts({
      ownerId: req.user.id,
      role: req.user.role,
      system_type,
      status,
      safe_id,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    res.json({
      data: accounts,
      count: accounts.length,
      total: accounts.length
    });
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
