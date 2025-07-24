import supabase from '../utils/supabaseClient.js';

// Default preferences
const DEFAULT_DASHBOARD_PREFERENCES = {
  theme: 'light',
  autoRefresh: true,
  refreshInterval: 30000, // 30 seconds
  showStatistics: true,
  showRecentActivity: true,
  showActiveJITSessions: true,
  showValidationStatus: true,
  compactView: false,
  customWidgets: []
};

const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailNotifications: true,
  pushNotifications: false,
  validationFailures: true,
  jitSessionExpiring: true,
  credentialRotation: true,
  securityAlerts: true,
  weeklyReports: false,
  immediateAlerts: true
};

export async function getDashboardPreferences(userId) {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('dashboard_preferences')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data?.dashboard_preferences || DEFAULT_DASHBOARD_PREFERENCES;
  } catch (err) {
    console.log('No existing dashboard preferences found, returning defaults');
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
}

export async function updateDashboardPreferences(userId, preferences) {
  try {
    const currentPrefs = await getDashboardPreferences(userId);
    const updatedPrefs = { ...currentPrefs, ...preferences };

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        dashboard_preferences: updatedPrefs,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;

    return updatedPrefs;
  } catch (err) {
    console.error('Error updating dashboard preferences:', err);
    throw err;
  }
}

export async function getNotificationPreferences(userId) {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('notification_preferences')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data?.notification_preferences || DEFAULT_NOTIFICATION_PREFERENCES;
  } catch (err) {
    console.log('No existing notification preferences found, returning defaults');
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function updateNotificationPreferences(userId, preferences) {
  try {
    const currentPrefs = await getNotificationPreferences(userId);
    const updatedPrefs = { ...currentPrefs, ...preferences };

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        notification_preferences: updatedPrefs,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;

    return updatedPrefs;
  } catch (err) {
    console.error('Error updating notification preferences:', err);
    throw err;
  }
}

export async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Remove sensitive fields
    const { created_at, updated_at, ...profile } = data;
    return profile;
  } catch (err) {
    console.error('Error getting user profile:', err);
    throw err;
  }
}

export async function updateUserProfile(userId, profileData) {
  try {
    // Only allow certain fields to be updated
    const allowedFields = ['full_name', 'avatar_url', 'timezone', 'language'];
    const updates = {};
    
    for (const field of allowedFields) {
      if (profileData[field] !== undefined) {
        updates[field] = profileData[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No valid fields provided for update');
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (err) {
    console.error('Error updating user profile:', err);
    throw err;
  }
}