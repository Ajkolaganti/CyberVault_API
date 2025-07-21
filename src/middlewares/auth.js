import jwt from 'jsonwebtoken';
import { JWT_SECRET, SUPABASE_JWT_SECRET } from '../config/env.js';
import logger from '../utils/logger.js';
import { supabaseAdmin } from '../utils/supabaseClient.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    // Ensure we have the user's role by looking it up in the profiles table when missing.
    if (!req.user.role) {
      try {
        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', req.user.id)
          .single();
        if (!error && data) {
          req.user.role = data.role;
        }
      } catch (lookupErr) {
        logger.warn('Failed to fetch user role', { error: lookupErr.message });
      }
    }
    return next();
  } catch (err) {
    try {
      // Fallback to Supabase JWT verification
      const decodedSupabase = jwt.verify(token, SUPABASE_JWT_SECRET);
      req.user = {
        id: decodedSupabase.sub,
        email: decodedSupabase.email,
        role: decodedSupabase.role, // may be undefined
      };

      // If role still not available, fetch from profiles table
      if (!req.user.role) {
        try {
          const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', req.user.id)
            .single();
          if (!error && data) {
            req.user.role = data.role;
          } else {
            req.user.role = 'User';
          }
        } catch (lookupErr) {
          logger.warn('Failed to fetch user role', { error: lookupErr.message });
          req.user.role = 'User';
        }
      }
      return next();
    } catch (supErr) {
      logger.warn('Invalid token', { error: supErr.message });
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
} 