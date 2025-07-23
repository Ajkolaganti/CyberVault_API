-- Migration: Update privileged_accounts table for enhanced security encryption
-- Run this in Supabase SQL editor or via supabase db push

-- Add encrypted columns for sensitive data
ALTER TABLE public.privileged_accounts 
ADD COLUMN IF NOT EXISTS encrypted_name text,
ADD COLUMN IF NOT EXISTS encrypted_username text,
ADD COLUMN IF NOT EXISTS encrypted_hostname_ip text,
ADD COLUMN IF NOT EXISTS encrypted_password text,
ADD COLUMN IF NOT EXISTS encrypted_notes text;

-- Remove old unencrypted columns (ONLY run this after data migration)
-- ALTER TABLE public.privileged_accounts 
-- DROP COLUMN IF EXISTS name,
-- DROP COLUMN IF EXISTS username,
-- DROP COLUMN IF EXISTS hostname_ip;

-- Add search hash columns for encrypted data (allows searching without decryption)
ALTER TABLE public.privileged_accounts 
ADD COLUMN IF NOT EXISTS username_hash varchar(16),
ADD COLUMN IF NOT EXISTS hostname_hash varchar(16);

-- Create indexes on hash columns for performance
CREATE INDEX IF NOT EXISTS idx_privileged_accounts_username_hash ON public.privileged_accounts(username_hash);
CREATE INDEX IF NOT EXISTS idx_privileged_accounts_hostname_hash ON public.privileged_accounts(hostname_hash);

-- Update comments to reflect encryption
COMMENT ON COLUMN public.privileged_accounts.encrypted_name IS 'AES-256-GCM encrypted account display name';
COMMENT ON COLUMN public.privileged_accounts.encrypted_username IS 'AES-256-GCM encrypted username/account name';
COMMENT ON COLUMN public.privileged_accounts.encrypted_hostname_ip IS 'AES-256-GCM encrypted hostname or IP address';
COMMENT ON COLUMN public.privileged_accounts.encrypted_password IS 'AES-256-GCM encrypted password or secret';
COMMENT ON COLUMN public.privileged_accounts.encrypted_notes IS 'AES-256-GCM encrypted notes or description';
COMMENT ON COLUMN public.privileged_accounts.username_hash IS 'SHA-256 hash fragment for username search indexing';
COMMENT ON COLUMN public.privileged_accounts.hostname_hash IS 'SHA-256 hash fragment for hostname search indexing';

-- Add notes column if not exists (from frontend request)
ALTER TABLE public.privileged_accounts 
ADD COLUMN IF NOT EXISTS notes text;

-- Rename old encrypted_password to maintain compatibility during transition
-- DO NOT run this until you verify the new encryption is working
-- ALTER TABLE public.privileged_accounts RENAME COLUMN encrypted_password TO encrypted_password_old;