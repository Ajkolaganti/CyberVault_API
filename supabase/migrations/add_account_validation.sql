-- Migration: Add account validation tracking
-- Run this in Supabase SQL editor

-- Add validation status columns to privileged_accounts table
ALTER TABLE public.privileged_accounts 
ADD COLUMN IF NOT EXISTS last_validation_status text CHECK (last_validation_status IN ('valid', 'invalid', 'pending')),
ADD COLUMN IF NOT EXISTS last_validated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS validation_message text;

-- Create account validation history table
CREATE TABLE IF NOT EXISTS public.account_validation_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.privileged_accounts(id) ON DELETE CASCADE,
    validation_status text NOT NULL CHECK (validation_status IN ('valid', 'invalid', 'pending')),
    validation_message text,
    error_category text,
    duration_ms integer DEFAULT 0,
    validated_by uuid REFERENCES auth.users(id),
    validated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_validation_history_account_id 
ON public.account_validation_history(account_id);

CREATE INDEX IF NOT EXISTS idx_account_validation_history_validated_at 
ON public.account_validation_history(validated_at DESC);

CREATE INDEX IF NOT EXISTS idx_privileged_accounts_validation_status 
ON public.privileged_accounts(last_validation_status);

-- Enable RLS on validation history table
ALTER TABLE public.account_validation_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for account validation history
CREATE POLICY "Users can view own account validation history" 
ON public.account_validation_history
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.privileged_accounts pa 
        WHERE pa.id = account_validation_history.account_id 
        AND pa.owner_id = auth.uid()
    )
);

-- Managers and Admins can view all validation history
CREATE POLICY "Elevated users can view all validation history" 
ON public.account_validation_history
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() 
        AND p.role IN ('Admin', 'Manager')
    )
);

-- Allow inserts for validation results (system operations)
CREATE POLICY "Allow system validation inserts" 
ON public.account_validation_history
FOR INSERT
WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.account_validation_history IS 'Tracks validation attempts and results for privileged accounts';
COMMENT ON COLUMN public.privileged_accounts.last_validation_status IS 'Last validation result: valid, invalid, or pending';
COMMENT ON COLUMN public.privileged_accounts.last_validated_at IS 'Timestamp of last validation attempt';
COMMENT ON COLUMN public.privileged_accounts.validation_message IS 'Last validation result message or error';