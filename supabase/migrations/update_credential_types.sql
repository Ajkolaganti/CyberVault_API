-- Migration: Update credential type constraint to include all supported types
-- Run this in Supabase SQL editor

-- Drop the existing constraint
ALTER TABLE public.credentials 
DROP CONSTRAINT IF EXISTS credentials_type_check;

-- Add updated constraint with all supported credential types
ALTER TABLE public.credentials 
ADD CONSTRAINT credentials_type_check 
CHECK (type IN (
  'password',        -- For Windows, Website, and general password-based credentials
  'ssh',            -- For SSH key-based credentials  
  'api_token',      -- For API tokens and bearer tokens
  'certificate',    -- For SSL/TLS certificates
  'database'        -- For database credentials
));

-- Add comment explaining the types
COMMENT ON CONSTRAINT credentials_type_check ON public.credentials IS 
'Supported credential types: password (Windows/Website), ssh, api_token, certificate, database';