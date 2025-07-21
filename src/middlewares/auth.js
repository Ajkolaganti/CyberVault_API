import jwt from 'jsonwebtoken';
import { JWT_SECRET, SUPABASE_JWT_SECRET } from '../config/env.js';
import logger from '../utils/logger.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    try {
      // Fallback to Supabase JWT verification
      const decodedSupabase = jwt.verify(token, SUPABASE_JWT_SECRET);
      req.user = {
        id: decodedSupabase.sub,
        email: decodedSupabase.email,
        role: decodedSupabase.role || 'User',
      };
      return next();
    } catch (supErr) {
      logger.warn('Invalid token', { error: supErr.message });
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
} 