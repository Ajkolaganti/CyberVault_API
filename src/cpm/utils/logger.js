/**
 * CPM Logger Utility
 * Provides structured logging for the Central Policy Manager
 */

import fs from 'fs';
import path from 'path';

class CPMLogger {
  constructor() {
    this.logLevel = process.env.CPM_LOG_LEVEL || 'info';
    this.logToFile = process.env.CPM_LOG_TO_FILE === 'true';
    this.logFile = process.env.CPM_LOG_FILE || './logs/cpm.log';
    
    // Ensure log directory exists
    if (this.logToFile) {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    this.currentLevel = this.levels[this.logLevel] || 2;
  }
  
  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const levelStr = level.toUpperCase().padEnd(5);
    
    let formattedMessage = `[${timestamp}] [PID:${pid}] [${levelStr}] ${message}`;
    
    if (args.length > 0) {
      const argsStr = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      formattedMessage += ` ${argsStr}`;
    }
    
    return formattedMessage;
  }
  
  writeToFile(message) {
    if (this.logToFile) {
      try {
        fs.appendFileSync(this.logFile, message + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }
  
  log(level, message, ...args) {
    if (this.levels[level] <= this.currentLevel) {
      const formattedMessage = this.formatMessage(level, message, ...args);
      
      // Write to console with appropriate method
      switch (level) {
        case 'error':
          console.error(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'info':
          console.info(formattedMessage);
          break;
        case 'debug':
          console.debug(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
      
      // Write to file if enabled
      this.writeToFile(formattedMessage);
    }
  }
  
  error(message, ...args) {
    this.log('error', message, ...args);
  }
  
  warn(message, ...args) {
    this.log('warn', message, ...args);
  }
  
  info(message, ...args) {
    this.log('info', message, ...args);
  }
  
  debug(message, ...args) {
    this.log('debug', message, ...args);
  }
  
  // Specialized methods for CPM operations
  credentialVerification(credentialId, type, result, details = {}) {
    const message = `Credential verification: ${credentialId} (${type}) = ${result}`;
    this.info(message, details);
  }
  
  auditLog(userId, action, resource, metadata = {}) {
    const message = `Audit: User ${userId} performed ${action} on ${resource}`;
    this.info(message, metadata);
  }
  
  securityEvent(event, severity, details = {}) {
    const message = `Security Event [${severity.toUpperCase()}]: ${event}`;
    if (severity === 'critical' || severity === 'high') {
      this.error(message, details);
    } else {
      this.warn(message, details);
    }
  }
  
  performance(operation, duration, details = {}) {
    const message = `Performance: ${operation} completed in ${duration}ms`;
    this.debug(message, details);
  }
}

export const logger = new CPMLogger();