import winston from 'winston';
import { Logtail } from "@logtail/node";

// Initialize Logtail with error handling
const logtail = process.env.LOGTAIL_TOKEN && process.env.LOGTAIL_TOKEN !== "YOUR_LOGTAIL_TOKEN" 
  ? new Logtail(process.env.LOGTAIL_TOKEN)
  : null;

// Add error handler to prevent spam (only if logtail exists and has event methods)
if (logtail && typeof logtail.on === 'function') {
  logtail.on('error', (error) => {
    console.warn('Logtail connection error:', error.message);
    // Don't spam logs with Logtail errors
  });
}

// Custom Logtail transport for Winston
class LogtailTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
    this.name = 'logtail';
    this.level = opts.level || 'info';
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Send to Logtail based on level (only if logtail is available)
    if (logtail) {
      const { level, message, ...meta } = info;
      
      try {
        switch (level) {
          case 'error':
            logtail.error(message, meta);
            break;
          case 'warn':
            logtail.warn(message, meta);
            break;
          case 'info':
            logtail.info(message, meta);
            break;
          case 'debug':
            logtail.debug(message, meta);
            break;
          default:
            logtail.log(message, meta);
        }
      } catch (error) {
        // Silently fail if Logtail has issues
        console.warn('Logtail logging failed:', error.message);
      }
    }

    callback();
  }
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    // Add Logtail transport for production logging
    ...(process.env.LOGTAIL_TOKEN ? [new LogtailTransport({ level: 'info' })] : [])
  ],
});

// Safe Logtail wrapper that handles null cases
const safeLogtail = {
  info: (message, meta = {}) => {
    if (logtail) {
      try {
        logtail.info(message, meta);
      } catch (error) {
        console.warn('Logtail info failed:', error.message);
      }
    }
  },
  warn: (message, meta = {}) => {
    if (logtail) {
      try {
        logtail.warn(message, meta);
      } catch (error) {
        console.warn('Logtail warn failed:', error.message);
      }
    }
  },
  error: (message, meta = {}) => {
    if (logtail) {
      try {
        logtail.error(message, meta);
      } catch (error) {
        console.warn('Logtail error failed:', error.message);
      }
    }
  },
  debug: (message, meta = {}) => {
    if (logtail) {
      try {
        logtail.debug(message, meta);
      } catch (error) {
        console.warn('Logtail debug failed:', error.message);
      }
    }
  },
  log: (message, meta = {}) => {
    if (logtail) {
      try {
        logtail.log(message, meta);
      } catch (error) {
        console.warn('Logtail log failed:', error.message);
      }
    }
  }
};

// Export both logger and safe logtail wrapper
export default logger;
export { safeLogtail as logtail }; 