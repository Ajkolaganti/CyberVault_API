-- Migration: Create safes table for organizing privileged accounts
-- Run this in Supabase SQL editor or via supabase db push

-- Create safes table
CREATE TABLE IF NOT EXISTS public.safes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  safe_type text DEFAULT 'standard' CHECK (safe_type IN ('standard', 'shared', 'department', 'application')),
  access_level text DEFAULT 'private' CHECK (access_level IN ('private', 'team', 'department', 'public')),
  settings jsonb DEFAULT '{
    "auto_purge_inactive_accounts": false,
    "require_dual_control": false,
    "audit_level": "standard",
    "notifications_enabled": true,
    "max_accounts": null,
    "allowed_system_types": []
  }'::jsonb,
  tags jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_safes_owner ON public.safes(owner_id);
CREATE INDEX IF NOT EXISTS idx_safes_type ON public.safes(safe_type);
CREATE INDEX IF NOT EXISTS idx_safes_access_level ON public.safes(access_level);
CREATE INDEX IF NOT EXISTS idx_safes_status ON public.safes(status);
CREATE INDEX IF NOT EXISTS idx_safes_name ON public.safes(name);

-- Create safe permissions table for granular access control
CREATE TABLE IF NOT EXISTS public.safe_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_id uuid REFERENCES public.safes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_level text NOT NULL CHECK (permission_level IN ('read', 'write', 'admin', 'owner')),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  UNIQUE(safe_id, user_id)
);

-- Create indexes for permissions
CREATE INDEX IF NOT EXISTS idx_safe_permissions_safe ON public.safe_permissions(safe_id);
CREATE INDEX IF NOT EXISTS idx_safe_permissions_user ON public.safe_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_safe_permissions_level ON public.safe_permissions(permission_level);

-- Create safe activity log table
CREATE TABLE IF NOT EXISTS public.safe_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_id uuid REFERENCES public.safes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create index for activity log
CREATE INDEX IF NOT EXISTS idx_safe_activity_safe ON public.safe_activity_log(safe_id);
CREATE INDEX IF NOT EXISTS idx_safe_activity_created ON public.safe_activity_log(created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.safes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safe_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safe_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for safes
-- Users can see safes they own
CREATE POLICY "Safes: owner access" ON public.safes
  FOR ALL USING (owner_id = auth.uid());

-- Users can see safes they have permissions for
CREATE POLICY "Safes: permission access" ON public.safes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.safe_permissions sp
      WHERE sp.safe_id = safes.id 
      AND sp.user_id = auth.uid()
      AND (sp.expires_at IS NULL OR sp.expires_at > now())
    )
  );

-- Admins and Managers can see all safes
CREATE POLICY "Safes: elevated access" ON public.safes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
    )
  );

-- RLS Policies for safe permissions
-- Users can see permissions for safes they own or have admin access to
CREATE POLICY "Safe permissions: owner and admin access" ON public.safe_permissions
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1
      FROM public.safes s
      WHERE s.id = safe_permissions.safe_id
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('Admin', 'Manager')
          )
        )
    )
  );

-- RLS Policies for activity log
-- Users can see activity for safes they have access to
CREATE POLICY "Safe activity: access based" ON public.safe_activity_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.safes s 
      WHERE s.id = safe_activity_log.safe_id 
      AND (
        s.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.safe_permissions sp
          WHERE sp.safe_id = s.id 
          AND sp.user_id = auth.uid()
          AND (sp.expires_at IS NULL OR sp.expires_at > now())
        ) OR
        EXISTS (
          SELECT 1 FROM public.profiles p 
          WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
        )
      )
    )
  );

-- Update the privileged_accounts table to include safe_id
ALTER TABLE public.privileged_accounts 
ADD COLUMN IF NOT EXISTS safe_id uuid REFERENCES public.safes(id) ON DELETE SET NULL;

-- Create index for the new foreign key
CREATE INDEX IF NOT EXISTS idx_privileged_accounts_safe ON public.privileged_accounts(safe_id);

-- Add trigger for updated_at on safes
CREATE TRIGGER update_safes_updated_at 
  BEFORE UPDATE ON public.safes 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.safes IS 'Secure containers for organizing privileged accounts';
COMMENT ON TABLE public.safe_permissions IS 'Granular access control for safes';
COMMENT ON TABLE public.safe_activity_log IS 'Audit trail for safe activities';
COMMENT ON COLUMN public.safes.settings IS 'JSON configuration for safe-specific settings';
COMMENT ON COLUMN public.safes.access_level IS 'Visibility level of the safe';
COMMENT ON COLUMN public.safe_permissions.permission_level IS 'Level of access granted to user';
