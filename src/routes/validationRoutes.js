import { Router } from 'express';
import * as validationController from '../controllers/validationController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All validation routes require authentication
router.use(authenticate);

// Real-time validation status endpoint (Server-Sent Events)
router.get('/stream', validationController.getValidationStream);

// Test endpoint for debugging EventSource
router.get('/test-stream', (req, res) => {
  console.log('Test stream request received:', {
    user: req.user?.id || 'no user',
    authenticated: !!req.user
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:5173',
    'Access-Control-Allow-Credentials': 'true'
  });

  res.write(`data: ${JSON.stringify({
    type: 'test',
    message: 'Test stream working',
    user: req.user?.id || 'anonymous',
    timestamp: new Date().toISOString()
  })}\n\n`);

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({
      type: 'heartbeat',
      timestamp: new Date().toISOString()
    })}\n\n`);
  }, 5000);

  req.on('close', () => {
    console.log('Test stream closed');
    clearInterval(interval);
  });
});

// Validation statistics
router.get('/statistics', validationController.getValidationStatistics);

// Recent validation activities
router.get('/recent', validationController.getRecentValidations);

// Validation status for specific resource
router.get('/status/:resourceType/:resourceId', validationController.getResourceValidationStatus);

export default router;