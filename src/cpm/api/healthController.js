/**
 * CPM Health Controller
 * Provides health check and monitoring endpoints for CPM service
 */

import express from 'express';
import { logger } from '../utils/logger.js';
import supabaseService from '../../utils/supabaseServiceClient.js';

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'cybervault-cpm',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      checks: {}
    };

    // Database connectivity check
    try {
      const { data, error } = await supabase
        .from('credentials')
        .select('count')
        .limit(1);
      
      if (error) throw error;
      
      health.checks.database = {
        status: 'healthy',
        response_time: Date.now() - startTime
      };
    } catch (error) {
      health.checks.database = {
        status: 'unhealthy',
        error: error.message,
        response_time: Date.now() - startTime
      };
      health.status = 'degraded';
    }

    // Memory check
    const memoryUsage = process.memoryUsage();
    const memoryUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    if (memoryUsedMB > 500) {
      health.checks.memory = {
        status: 'warning',
        used_mb: Math.round(memoryUsedMB),
        message: 'High memory usage'
      };
      if (health.status === 'healthy') health.status = 'degraded';
    } else {
      health.checks.memory = {
        status: 'healthy',
        used_mb: Math.round(memoryUsedMB)
      };
    }

    // Process check
    health.checks.process = {
      status: 'healthy',
      pid: process.pid,
      node_version: process.version,
      platform: process.platform
    };

    const responseTime = Date.now() - startTime;
    health.response_time = responseTime;

    // Set appropriate HTTP status
    const httpStatus = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(health);

  } catch (error) {
    logger.error('Health check failed:', error);
    
    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'cybervault-cpm',
      error: error.message,
      response_time: Date.now() - startTime
    };

    res.status(503).json(errorResponse);
  }
});

// Readiness check
router.get('/ready', async (req, res) => {
  try {
    // Check if all required dependencies are available
    const checks = [];

    // Database check
    try {
      await supabaseService.from('credentials').select('count').limit(1);
      checks.push({ name: 'database', status: 'ready' });
    } catch (error) {
      checks.push({ name: 'database', status: 'not_ready', error: error.message });
    }

    // Environment variables check
    const requiredEnvVars = ['ENCRYPTION_KEY', 'ENCRYPTION_IV', 'SUPABASE_URL'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      checks.push({ 
        name: 'environment', 
        status: 'not_ready', 
        error: `Missing environment variables: ${missingEnvVars.join(', ')}` 
      });
    } else {
      checks.push({ name: 'environment', status: 'ready' });
    }

    const allReady = checks.every(check => check.status === 'ready');

    const response = {
      ready: allReady,
      timestamp: new Date().toISOString(),
      checks: checks
    };

    res.status(allReady ? 200 : 503).json(response);

  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Liveness check
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    // Get credential statistics
    const { data: credentials, error } = await supabase
      .from('credentials')
      .select('type, status, verified_at, last_verification_attempt, created_at');

    if (error) throw error;

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const metrics = {
      timestamp: new Date().toISOString(),
      credentials: {
        total: credentials.length,
        by_status: credentials.reduce((acc, cred) => {
          acc[cred.status || 'pending'] = (acc[cred.status || 'pending'] || 0) + 1;
          return acc;
        }, {}),
        by_type: credentials.reduce((acc, cred) => {
          acc[cred.type] = (acc[cred.type] || 0) + 1;
          return acc;
        }, {}),
        verified_last_24h: credentials.filter(c => 
          c.verified_at && new Date(c.verified_at).getTime() > oneDayAgo
        ).length,
        verified_last_week: credentials.filter(c => 
          c.verified_at && new Date(c.verified_at).getTime() > oneWeekAgo
        ).length,
        never_verified: credentials.filter(c => !c.verified_at).length,
        stale_verifications: credentials.filter(c => 
          c.verified_at && (now - new Date(c.verified_at).getTime()) > (30 * 24 * 60 * 60 * 1000)
        ).length
      },
      system: {
        uptime: Math.floor(process.uptime()),
        memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        memory_total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        cpu_usage: process.cpuUsage(),
        node_version: process.version,
        platform: process.platform,
        pid: process.pid
      }
    };

    res.json(metrics);

  } catch (error) {
    logger.error('Metrics endpoint failed:', error);
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;