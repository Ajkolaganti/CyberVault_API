import * as dashboardService from '../services/dashboardService.js';

export async function getStats(req, res, next) {
  try {
    const stats = await dashboardService.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

export async function getAlerts(req, res, next) {
  try {
    const alerts = await dashboardService.getAlerts({ limit: 20 });
    res.json({ items: alerts });
  } catch (err) {
    next(err);
  }
}

export async function getValidationData(req, res, next) {
  try {
    const range = req.query.range || '24h';
    const validationData = await dashboardService.getValidationData({
      userId: req.user.id,
      role: req.user.role,
      range
    });
    
    res.json({
      success: true,
      data: validationData
    });
  } catch (err) {
    next(err);
  }
}

export async function getAnalyticsData(req, res, next) {
  try {
    const range = req.query.range || '24h';
    const analyticsData = await dashboardService.getAnalyticsData({
      userId: req.user.id,
      role: req.user.role,
      range
    });
    
    res.json({
      success: true,
      data: analyticsData
    });
  } catch (err) {
    next(err);
  }
}

export async function getJitHealthData(req, res, next) {
  try {
    const range = req.query.range || '24h';
    const jitHealthData = await dashboardService.getJitHealthData({
      userId: req.user.id,
      role: req.user.role,
      range
    });
    
    res.json({
      success: true,
      data: jitHealthData
    });
  } catch (err) {
    next(err);
  }
}

export async function getSystemHealthData(req, res, next) {
  try {
    const range = req.query.range || '24h';
    const systemHealthData = await dashboardService.getSystemHealthData({
      userId: req.user.id,
      role: req.user.role,
      range
    });
    
    res.json({
      success: true,
      data: systemHealthData
    });
  } catch (err) {
    next(err);
  }
} 