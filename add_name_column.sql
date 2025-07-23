-- Migration: Add name column to privileged_accounts table
-- Run this in Supabase SQL editor or via supabase db push

-- Add the name column to the privileged_accounts table
ALTER TABLE public.privileged_accounts 
ADD COLUMN IF NOT EXISTS name text;

-- Add comment for the new column
COMMENT ON COLUMN public.privileged_accounts.name IS 'Display name or friendly name for the privileged account';