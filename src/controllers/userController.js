import * as userService from '../services/userService.js';

export async function getDashboardPreferences(req, res, next) {
  try {
    const preferences = await userService.getDashboardPreferences(req.user.id);
    res.json({
      success: true,
      data: preferences
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDashboardPreferences(req, res, next) {
  try {
    const preferences = await userService.updateDashboardPreferences(
      req.user.id, 
      req.body
    );
    res.json({
      success: true,
      message: 'Dashboard preferences updated successfully',
      data: preferences
    });
  } catch (err) {
    next(err);
  }
}

export async function getNotificationPreferences(req, res, next) {
  try {
    const preferences = await userService.getNotificationPreferences(req.user.id);
    res.json({
      success: true,
      data: preferences
    });
  } catch (err) {
    next(err);
  }
}

export async function updateNotificationPreferences(req, res, next) {
  try {
    const preferences = await userService.updateNotificationPreferences(
      req.user.id, 
      req.body
    );
    res.json({
      success: true,
      message: 'Notification preferences updated successfully', 
      data: preferences
    });
  } catch (err) {
    next(err);
  }
}

export async function getUserProfile(req, res, next) {
  try {
    const profile = await userService.getUserProfile(req.user.id);
    res.json({
      success: true,
      data: profile
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUserProfile(req, res, next) {
  try {
    const profile = await userService.updateUserProfile(req.user.id, req.body);
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: profile
    });
  } catch (err) {
    next(err);
  }
}