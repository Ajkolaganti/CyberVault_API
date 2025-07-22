-- Migration: Create privileged_accounts table for account management
-- Run this in Supabase SQL editor or via supabase db push

-- Drop existing accounts table if it exists (rename to avoid conflicts)
ALTER TABLE IF EXISTS public.accounts RENAME TO discovered_accounts;

-- Create privileged_accounts table
CREATE TABLE IF NOT EXISTS public.privileged_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  safe_id uuid REFERENCES public.safes(id) ON DELETE SET NULL, -- Reference to safe where account is stored
  system_type text NOT NULL CHECK (system_type IN ('Windows', 'Linux', 'Database', 'Cloud', 'Network', 'Application', 'Security', 'Directory', 'Website', 'Operating System', 'Certificates', 'Misc', 'Oracle DB', 'AWS', 'Azure')),
  hostname_ip text NOT NULL,
  port integer, -- Optional port number (e.g., 22 for SSH, 3389 for RDP)
  username text NOT NULL,
  encrypted_password text NOT NULL, -- AES-256 encrypted password/secret
  connection_method text CHECK (connection_method IN ('RDP', 'SSH', 'SQL', 'HTTPS', 'HTTP', 'SFTP', 'Telnet', 'VNC', 'PowerShell', 'WinRM', 'Custom')), -- Connection method
  platform_id text, -- CyberArk platform policy (e.g., WinDomain, UnixSSH, Oracle)
  account_type text CHECK (account_type IN ('Local', 'Domain', 'Service', 'Application', 'Database', 'System', 'Shared', 'Emergency')), -- Account type
  account_description text,
  tags jsonb DEFAULT '[]'::jsonb,
  rotation_policy jsonb DEFAULT '{
    "enabled": false,
    "interval_days": 90,
    "complexity_requirements": {
      "min_length": 12,
      "require_uppercase": true,
      "require_lowercase": true,
      "require_numbers": true,
      "require_symbols": true
    },
    "notification_days": 7,
    "auto_rotate": false
  }'::jsonb,
  last_rotated timestamp with time zone,
  next_rotation timestamp with time zone,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired', 'rotation_required')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_privileged_accounts_owner ON public.privileged_accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_privileged_accounts_system_type ON public.privileged_accounts(system_type);
CREATE INDEX IF NOT EXISTS idx_privileged_accounts_status ON public.privileged_accounts(status);
CREATE INDEX IF NOT EXISTS idx_privileged_accounts_rotation ON public.privileged_accounts(next_rotation) WHERE next_rotation IS NOT NULL;

-- Enable RLS
ALTER TABLE public.privileged_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own accounts
CREATE POLICY "Privileged accounts: owner access" ON public.privileged_accounts
  FOR ALL USING (owner_id = auth.uid());

-- Managers and Admins can see all accounts
CREATE POLICY "Privileged accounts: elevated access" ON public.privileged_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
    )
  );

-- Create account rotation history table
CREATE TABLE IF NOT EXISTS public.account_rotation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.privileged_accounts(id) ON DELETE CASCADE,
  rotated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rotation_type text NOT NULL CHECK (rotation_type IN ('manual', 'automatic', 'forced')),
  previous_password_hash text, -- Store hash for audit purposes (not actual password)
  rotation_status text NOT NULL CHECK (rotation_status IN ('success', 'failed', 'pending')),
  error_message text,
  rotated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on rotation history
ALTER TABLE public.account_rotation_history ENABLE ROW LEVEL SECURITY;

-- RLS for rotation history
CREATE POLICY "Rotation history: owner access" ON public.account_rotation_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.privileged_accounts pa 
      WHERE pa.id = account_rotation_history.account_id 
      AND (pa.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
      ))
    )
  );

-- Comments for documentation
COMMENT ON TABLE public.privileged_accounts IS 'Privileged accounts with automatic rotation policies';
COMMENT ON COLUMN public.privileged_accounts.rotation_policy IS 'JSON configuration for password rotation settings';
COMMENT ON COLUMN public.privileged_accounts.encrypted_password IS 'AES-256 encrypted password or token';
COMMENT ON COLUMN public.privileged_accounts.tags IS 'JSON array of tags for categorization';

-- Update function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_privileged_accounts_updated_at 
  BEFORE UPDATE ON public.privileged_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
