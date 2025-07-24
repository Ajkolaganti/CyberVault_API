import * as validationService from '../services/validationService.js';

// Server-Sent Events for real-time validation updates
export async function getValidationStream(req, res, next) {
  try {
    console.log('Validation stream request received:', {
      user: req.user?.id || 'no user',
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']
    });

    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      console.error('Unauthenticated request to validation stream');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Set headers for Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'Content-Type',
      'X-Accel-Buffering': 'no' // Disable nginx buffering if behind proxy
    });

    console.log(`Starting validation stream for user ${req.user.id}`);

    // Send initial connection event
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      message: 'Validation stream connected',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Set up periodic updates (every 30 seconds)
    const intervalId = setInterval(async () => {
      try {
        const stats = await validationService.getValidationStatistics(req.user.id, req.user.role);
        
        res.write(`data: ${JSON.stringify({
          type: 'statistics_update',
          data: stats,
          timestamp: new Date().toISOString()
        })}\n\n`);
      } catch (error) {
        console.error('Error sending validation statistics:', error);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: 'Failed to fetch validation statistics',
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
    }, 30000);

    // Send heartbeat every 10 seconds
    const heartbeatId = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 10000);

    // Clean up on client disconnect
    req.on('close', () => {
      console.log(`Validation stream closed for user ${req.user.id}`);
      clearInterval(intervalId);
      clearInterval(heartbeatId);
    });

    // Handle connection errors
    req.on('error', (error) => {
      console.error(`Validation stream error for user ${req.user.id}:`, error);
      clearInterval(intervalId);
      clearInterval(heartbeatId);
    });

    // Handle response errors
    res.on('error', (error) => {
      console.error(`Validation stream response error for user ${req.user.id}:`, error);
      clearInterval(intervalId);
      clearInterval(heartbeatId);
    });

  } catch (err) {
    console.error('Error setting up validation stream:', err);
    
    // Make sure response hasn't been sent yet
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to establish validation stream',
        error: err.message
      });
    }
  }
}

export async function getValidationStatistics(req, res, next) {
  try {
    const stats = await validationService.getValidationStatistics(req.user.id, req.user.role);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
}

export async function getRecentValidations(req, res, next) {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const validations = await validationService.getRecentValidations({
      userId: req.user.id,
      role: req.user.role,
      limit,
      offset
    });
    
    res.json({
      success: true,
      data: validations
    });
  } catch (err) {
    next(err);
  }
}

export async function getResourceValidationStatus(req, res, next) {
  try {
    const { resourceType, resourceId } = req.params;
    
    const status = await validationService.getResourceValidationStatus({
      resourceType,
      resourceId,
      userId: req.user.id,
      role: req.user.role
    });
    
    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    next(err);
  }
}

export async function getJitHealthStatus(req, res, next) {
  try {
    const { range = '24h' } = req.query;
    
    const healthData = await validationService.getJitHealthStatus({
      userId: req.user.id,
      role: req.user.role,
      range
    });
    
    res.json({
      success: true,
      data: healthData
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountsValidationStatus(req, res, next) {
  try {
    const { range = '24h' } = req.query;
    
    const accountsStatus = await validationService.getAccountsValidationStatus({
      userId: req.user.id,
      role: req.user.role,
      range
    });
    
    res.json({
      success: true,
      data: accountsStatus
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountsValidationStatistics(req, res, next) {
  try {
    const { range = '24h' } = req.query;
    
    const statistics = await validationService.getAccountsValidationStatistics({
      userId: req.user.id,
      role: req.user.role,
      range
    });
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountsValidationHistory(req, res, next) {
  try {
    const { limit = 50, offset = 0, range = '7d' } = req.query;
    
    const history = await validationService.getAccountsValidationHistory({
      userId: req.user.id,
      role: req.user.role,
      limit: parseInt(limit),
      offset: parseInt(offset),
      range
    });
    
    res.json({
      success: true,
      data: history,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: history.length
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountsValidationFailures(req, res, next) {
  try {
    const { limit = 50, range = '24h' } = req.query;
    
    const failures = await validationService.getAccountsValidationFailures({
      userId: req.user.id,
      role: req.user.role,
      limit: parseInt(limit),
      range
    });
    
    res.json({
      success: true,
      data: failures
    });
  } catch (err) {
    next(err);
  }
}