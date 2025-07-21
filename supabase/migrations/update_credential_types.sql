-- Migration: Update credentials table type constraint to include 'database' type
-- Run this in Supabase SQL editor or via supabase db push

-- Drop the existing check constraint
ALTER TABLE public.credentials 
DROP CONSTRAINT IF EXISTS credentials_type_check;

-- Add the updated constraint with 'database' type
ALTER TABLE public.credentials 
ADD CONSTRAINT credentials_type_check 
CHECK (type IN ('password','ssh','api_token','certificate','database'));

-- Add comment
COMMENT ON CONSTRAINT credentials_type_check ON public.credentials IS 'Ensures credential type is one of the allowed values including database';
