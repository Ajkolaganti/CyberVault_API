-- Migration: Add verification status columns to credentials table
-- Run this in Supabase SQL editor or via supabase db push

-- Add verification status columns
ALTER TABLE public.credentials 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_verification_attempt timestamp with time zone,
ADD COLUMN IF NOT EXISTS verification_error text,
ADD COLUMN IF NOT EXISTS host text, -- For connections (hostname/IP)
ADD COLUMN IF NOT EXISTS port integer, -- For connections
ADD COLUMN IF NOT EXISTS username text, -- For connections
ADD COLUMN IF NOT EXISTS system_type text; -- System type for verification routing

-- Create indexes for CPM queries
CREATE INDEX IF NOT EXISTS idx_credentials_status ON public.credentials(status);
CREATE INDEX IF NOT EXISTS idx_credentials_verification ON public.credentials(status, verified_at) WHERE status IN ('pending') OR verified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_credentials_type ON public.credentials(type);

-- Add comments
COMMENT ON COLUMN public.credentials.status IS 'Verification status: pending, verified, failed, expired';
COMMENT ON COLUMN public.credentials.verified_at IS 'Timestamp of last successful verification';
COMMENT ON COLUMN public.credentials.last_verification_attempt IS 'Timestamp of last verification attempt';
COMMENT ON COLUMN public.credentials.verification_error IS 'Last verification error message';
COMMENT ON COLUMN public.credentials.host IS 'Hostname/IP for connections';
COMMENT ON COLUMN public.credentials.port IS 'Port number for connections';
COMMENT ON COLUMN public.credentials.username IS 'Username for connections';
COMMENT ON COLUMN public.credentials.system_type IS 'System type for verification routing (Windows, Linux, Database, etc.)';