import { supabaseAdmin } from '../utils/supabaseClient.js';
import { logtail } from '../utils/logger.js';

export async function getSystemHealth(req, res, next) {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      services: {
        database: 'unknown',
        authentication: 'healthy',
        jit_service: 'healthy',
        cpm_service: 'healthy'
      },
      metrics: {
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          limit: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        cpu: {
          load: process.cpuUsage()
        }
      }
    };

    // Test database connection
    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .limit(1);
      
      if (error) {
        healthData.services.database = 'error';
        healthData.status = 'degraded';
      } else {
        healthData.services.database = 'healthy';
      }
    } catch (dbError) {
      healthData.services.database = 'error';
      healthData.status = 'unhealthy';
    }

    // Determine overall status
    const unhealthyServices = Object.values(healthData.services).filter(status => status === 'error');
    if (unhealthyServices.length > 0) {
      healthData.status = unhealthyServices.length === Object.keys(healthData.services).length ? 'unhealthy' : 'degraded';
    }

    // Log health check
    logtail.info("System health check", {
      app_name: "CyberVault API",
      type: "health_check",
      status: healthData.status,
      uptime_seconds: healthData.uptime,
      memory_used_mb: healthData.metrics.memory.used,
      database_status: healthData.services.database,
      timestamp: new Date().toISOString()
    });

    // Set appropriate HTTP status
    const httpStatus = healthData.status === 'healthy' ? 200 : 
                     healthData.status === 'degraded' ? 206 : 503;

    res.status(httpStatus).json({
      success: true,
      data: healthData
    });

  } catch (err) {
    // Log error
    logtail.error("Health check failed", {
      app_name: "CyberVault API",
      type: "health_check_error",
      error_message: err.message,
      timestamp: new Date().toISOString()
    });

    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: err.message
      }
    });
  }
}

export async function getDetailedHealth(req, res, next) {
  try {
    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'unknown', responseTime: 0 },
        authentication: { status: 'healthy', responseTime: 0 },
        jit_cleanup: { status: 'unknown', lastRun: null },
        validation_job: { status: 'unknown', lastRun: null },
        disk_space: { status: 'unknown', usage: 0 },
        external_dependencies: { status: 'unknown' }
      },
      performance: {
        requests_per_minute: 0,
        average_response_time: 0,
        error_rate: 0
      }
    };

    // Database health check with timing
    const dbStart = Date.now();
    try {
      const { data, error } = await supabaseAdmin
        .from('jit_sessions')
        .select('id', { count: 'exact' })
        .limit(1);
      
      detailedHealth.checks.database = {
        status: error ? 'error' : 'healthy',
        responseTime: Date.now() - dbStart,
        error: error?.message
      };
    } catch (dbError) {
      detailedHealth.checks.database = {
        status: 'error',
        responseTime: Date.now() - dbStart,
        error: dbError.message
      };
    }

    // Check recent job runs from audit logs
    try {
      const { data: jobLogs } = await supabaseAdmin
        .from('audit_logs')
        .select('action, created_at')
        .in('action', ['jit_cleanup', 'account_verification_job'])
        .order('created_at', { ascending: false })
        .limit(2);

      if (jobLogs) {
        const jitCleanupLog = jobLogs.find(log => log.action === 'jit_cleanup');
        const validationJobLog = jobLogs.find(log => log.action === 'account_verification_job');

        detailedHealth.checks.jit_cleanup = {
          status: jitCleanupLog ? 'healthy' : 'warning',
          lastRun: jitCleanupLog?.created_at || null
        };

        detailedHealth.checks.validation_job = {
          status: validationJobLog ? 'healthy' : 'warning',
          lastRun: validationJobLog?.created_at || null
        };
      }
    } catch (jobError) {
      detailedHealth.checks.jit_cleanup.status = 'error';
      detailedHealth.checks.validation_job.status = 'error';
    }

    // Overall status determination
    const errorChecks = Object.values(detailedHealth.checks).filter(check => check.status === 'error');
    const warningChecks = Object.values(detailedHealth.checks).filter(check => check.status === 'warning');

    if (errorChecks.length > 0) {
      detailedHealth.status = 'unhealthy';
    } else if (warningChecks.length > 0) {
      detailedHealth.status = 'degraded';
    }

    res.json({
      success: true,
      data: detailedHealth
    });

  } catch (err) {
    next(err);
  }
}