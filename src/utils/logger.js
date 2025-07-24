import winston from 'winston';
import { Logtail } from "@logtail/node";

// Initialize Logtail
const logtail = new Logtail(process.env.LOGTAIL_TOKEN || "YOUR_LOGTAIL_TOKEN");

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

    // Send to Logtail based on level
    const { level, message, ...meta } = info;
    
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

// Export both logger and logtail for direct usage
export default logger;
export { logtail }; 