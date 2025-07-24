import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';

import routes from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import logger from './utils/logger.js';
import { auditLogger } from './middlewares/auditLogger.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { corsLogger, securityLogger } from './middlewares/endpointLogger.js';
import jitCleanupJob from './jobs/jitCleanupJob.js';
import verifyAccountsJob from './jobs/verifyAccountsJob.js';
import { CPMService } from './cpm/services/CPMService.js';
import { CPMConfig } from './cpm/config/cpmConfig.js';

dotenv.config();

const app = express();

// Security middlewares
app.use(helmet());

// CORS configuration
// Allow multiple origins including your frontend
const allowedOrigins = [
  'http://localhost:5173',      // Vite dev server
  'http://localhost:3000',      // Alternative React dev server
  'http://127.0.0.1:5173',     // Alternative localhost
  'https://cyber-vault-ui.vercel.app', // Your production frontend URL
  // Additional development origins
  'http://localhost:3001',      // Additional dev server
  'http://localhost:5174',      // Additional Vite dev server
  'http://127.0.0.1:3000',     // Alternative localhost
];

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL?.split(',') || allowedOrigins.filter(origin => origin.startsWith('https://'))
    : allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400 // 24 hours
};

app.use(cors({
  origin: (origin, callback) => {
    const whitelist = process.env.NODE_ENV === 'production'
      ? (process.env.FRONTEND_URL?.split(',') || [])
      : allowedOrigins;
    if (!origin || whitelist.includes(origin)) {
      callback(null, origin || '');
    } else {
      callback(new Error('CORS not allowed by rules'), false);
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept','Origin'],
  exposedHeaders: ['X-Total-Count','X-Page-Count'],
  maxAge: 86400
}));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

app.use(express.json({ limit: '10kb' }));

// Configure rate limiting based on environment
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Higher limit for development
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.round(15 * 60) // 15 minutes in seconds
  },
  // Skip rate limiting for certain IPs in development
  skip: (req) => {
    if (process.env.NODE_ENV !== 'production') {
      // Skip rate limiting for localhost/development IPs
      const devIPs = ['127.0.0.1', '::1', 'localhost'];
      return devIPs.includes(req.ip) || devIPs.includes(req.connection.remoteAddress);
    }
    return false;
  }
});
app.use(limiter);

// Swagger docs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swaggerDocument = YAML.load(path.join(__dirname, '../docs/swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use(requestLogger);
app.use(corsLogger);
app.use(securityLogger);
app.use('/api/v1', routes);
app.use(auditLogger);

// Error handler
app.use(errorHandler);

// Start the JIT cleanup background job
jitCleanupJob.start();

// Start the account verification background job
verifyAccountsJob.start();

// Start the CPM service for credential verification
let cpmService;
async function startCPMService() {
  try {
    const cpmConfig = CPMConfig.getInstance();
    if (cpmConfig.validate()) {
      cpmService = new CPMService(cpmConfig);
      await cpmService.start();
      logger.info('CPM Service started successfully');
    } else {
      logger.warn('CPM Service not started due to invalid configuration');
    }
  } catch (error) {
    logger.error('Failed to start CPM Service:', error);
  }
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  logger.info(`Server listening on port ${PORT}`);
  logger.info('JIT cleanup background job started');
  logger.info('Account verification background job started');
  await startCPMService();
});
