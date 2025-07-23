#!/usr/bin/env node

/**
 * Central Policy Manager (CPM) - Main Entry Point
 * 
 * This service runs in the background and performs automated credential verification
 * across different types of systems and services.
 */

import { CPMService } from './services/CPMService.js';
import { logger } from './utils/logger.js';
import { CPMConfig } from './config/cpmConfig.js';

// Handle graceful shutdown
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

let cpmService;

async function main() {

  try {
    logger.info('🔐 Starting CyberVault Central Policy Manager (CPM)');
    logger.info('================================================');
    
    // Validate configuration
    const config = CPMConfig.getInstance();
    if (!config.validate()) {
      logger.error('❌ Invalid CPM configuration. Exiting.');
      process.exit(1);
    }
    
    logger.info('✓ Configuration validated');
    logger.info(`✓ Scan interval: ${config.get('scanInterval')}ms`);
    logger.info(`✓ Verification timeout: ${config.get('verificationTimeout')}ms`);
    logger.info(`✓ Max concurrent verifications: ${config.get('maxConcurrentVerifications')}`);
    
    // Initialize and start CPM service
    cpmService = new CPMService(config);
    await cpmService.start();
    
    logger.info('🚀 CPM Service started successfully');
    logger.info('Monitoring credentials for verification...');
    
  } catch (error) {
    logger.error('❌ Failed to start CPM Service:', error);
    process.exit(1);
  }
}

async function handleShutdown(signal) {
  logger.info(`\n📡 Received ${signal}. Gracefully shutting down CPM Service...`);
  
  try {
    if (cpmService) {
      await cpmService.stop();
    }
    logger.info('✓ CPM Service stopped successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the service
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}