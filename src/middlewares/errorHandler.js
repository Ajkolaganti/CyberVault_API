import logger from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error(err);
  const status = err.status || 500;
  const response = {
    status: 'error',
    message: err.message || 'Internal Server Error',
  };

  // Include validation errors if present
  if (err.errors) {
    response.errors = err.errors;
  }

  // Expose stack trace in development for easier debugging
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(status).json(response);
} 