-- Migration: Create user preferences table
-- Run this in Supabase SQL editor

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dashboard_preferences jsonb DEFAULT '{
        "theme": "light",
        "autoRefresh": true,
        "refreshInterval": 30000,
        "showStatistics": true,
        "showRecentActivity": true,
        "showActiveJITSessions": true,
        "showValidationStatus": true,
        "compactView": false,
        "customWidgets": []
    }'::jsonb,
    notification_preferences jsonb DEFAULT '{
        "emailNotifications": true,
        "pushNotifications": false,
        "validationFailures": true,
        "jitSessionExpiring": true,
        "credentialRotation": true,
        "securityAlerts": true,
        "weeklyReports": false,
        "immediateAlerts": true
    }'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
ON public.user_preferences(user_id);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only access their own preferences
CREATE POLICY "Users can manage own preferences" 
ON public.user_preferences
FOR ALL
USING (user_id = auth.uid());

-- Add comments
COMMENT ON TABLE public.user_preferences IS 'User dashboard and notification preferences';
COMMENT ON COLUMN public.user_preferences.dashboard_preferences IS 'JSON configuration for dashboard settings';
COMMENT ON COLUMN public.user_preferences.notification_preferences IS 'JSON configuration for notification settings';