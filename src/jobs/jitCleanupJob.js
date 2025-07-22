import cron from 'node-cron';
import * as jitService from '../services/jitService.js';
import logger from '../utils/logger.js';

class JITCleanupJob {
  constructor() {
    this.isRunning = false;
  }

  // Run cleanup every 5 minutes
  start() {
    logger.info('Starting JIT cleanup job scheduler...');
    
    // Schedule cleanup every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      if (this.isRunning) {
        logger.warn('JIT cleanup job already running, skipping this execution');
        return;
      }
      
      try {
        this.isRunning = true;
        await this.executeCleanup();
      } catch (error) {
        logger.error('JIT cleanup job failed:', error);
      } finally {
        this.isRunning = false;
      }
    });

    // Also run cleanup every hour for more thorough check
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running hourly comprehensive JIT cleanup');
        await this.executeComprehensiveCleanup();
      } catch (error) {
        logger.error('Comprehensive JIT cleanup failed:', error);
      }
    });

    logger.info('JIT cleanup job scheduler started successfully');
  }

  async executeCleanup() {
    logger.info('Executing JIT cleanup job');
    
    try {
      const result = await jitService.cleanupExpiredSessions();
      const updatedCount = Array.isArray(result) ? result.length : 0;
      
      if (updatedCount > 0) {
        logger.info(`JIT cleanup completed: ${updatedCount} sessions marked as expired`);
      } else {
        logger.debug('JIT cleanup completed: no expired sessions found');
      }
      
      return { success: true, updatedCount };
    } catch (error) {
      logger.error('JIT cleanup execution failed:', error);
      throw error;
    }
  }

  async executeComprehensiveCleanup() {
    logger.info('Executing comprehensive JIT cleanup');
    
    try {
      // Clean up expired sessions
      const expiredResult = await jitService.cleanupExpiredSessions();
      
      // Get statistics
      const stats = await jitService.getJITStatistics();
      
      logger.info('Comprehensive JIT cleanup completed', {
        expiredSessions: Array.isArray(expiredResult) ? expiredResult.length : 0,
        statistics: stats
      });
      
      return { success: true, stats };
    } catch (error) {
      logger.error('Comprehensive JIT cleanup failed:', error);
      throw error;
    }
  }

  // Manual trigger for testing
  async runManualCleanup() {
    if (this.isRunning) {
      throw new Error('Cleanup job is already running');
    }
    
    try {
      this.isRunning = true;
      return await this.executeCleanup();
    } finally {
      this.isRunning = false;
    }
  }
}

export default new JITCleanupJob();
