-- Migration: Add system and business_justification columns to jit_sessions table
-- Run this in Supabase SQL editor or via supabase db push

-- Add the new columns to jit_sessions table
ALTER TABLE public.jit_sessions 
ADD COLUMN IF NOT EXISTS system TEXT,
ADD COLUMN IF NOT EXISTS business_justification TEXT NOT NULL DEFAULT '';

-- Update existing records to have empty business justification if needed
UPDATE public.jit_sessions 
SET business_justification = '' 
WHERE business_justification IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.jit_sessions.system IS 'The system/resource being accessed (replaces the generic resource field)';
COMMENT ON COLUMN public.jit_sessions.business_justification IS 'Business justification for requesting JIT access';
