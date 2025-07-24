import supabase from '../utils/supabaseClient.js';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { JWT_SECRET } from '../config/env.js';
import { logtail } from '../utils/logger.js';

export async function register(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed');
      error.status = 400;
      error.errors = errors.array();
      return next(error);
    }

    const { email, password, role } = req.body;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    // Store role in a separate table
    await supabase.from('profiles').insert([{ id: data.user.id, role }]);

    // Log successful registration
    logtail.info("User registered successfully", {
      app_name: "CyberVault API",
      type: "auth_event",
      action: "register",
      endpoint: "/api/v1/auth/register",
      method: "POST",
      user_id: data.user.id,
      user_email: email,
      user_role: role,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // Log failed login attempt
      logtail.warn("User login failed", {
        app_name: "CyberVault API",
        type: "auth_event",
        action: "login_failed",
        endpoint: "/api/v1/auth/login",
        method: "POST",
        user_email: email,
        error_message: error.message,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        timestamp: new Date().toISOString(),
        success: false
      });
      return res.status(400).json({ message: error.message });
    }

    const { data: profile, error: profileError, status: profileStatus } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError && profileStatus !== 406) {
      // real error (not no rows)
      return res.status(400).json({ message: profileError.message });
    }

    let userRole = profile?.role || 'User';
    if (!profile) {
      // create missing profile with default role
      const { error: createErr } = await supabase.from('profiles').insert([
        { id: data.user.id, role: userRole },
      ]);
      if (createErr) {
        return res.status(500).json({ message: createErr.message });
      }
    }

    const tokenPayload = {
      id: data.user.id,
      email,
      role: userRole,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });

    // Log successful login
    logtail.info("User login successful", {
      app_name: "CyberVault API",
      type: "auth_event",
      action: "login",
      endpoint: "/api/v1/auth/login",
      method: "POST",
      user_id: data.user.id,
      user_email: email,
      user_role: userRole,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      success: true
    });

    res.json({ token });
  } catch (err) {
    next(err);
  }
} 