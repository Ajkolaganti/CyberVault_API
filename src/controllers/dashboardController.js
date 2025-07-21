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