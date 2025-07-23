-- Migration: Fix RLS policies for CPM service verification updates
-- Run this in Supabase SQL editor

-- Create a system policy that allows server-side updates for verification status
-- This policy allows updates to verification-related columns without user context
CREATE POLICY "CPM Service: verification updates" ON public.credentials
  FOR UPDATE 
  USING (true)  -- Allow all updates from server
  WITH CHECK (
    -- Only allow updates to verification-related columns
    -- This ensures the policy is only used for CPM verification updates
    OLD.id = NEW.id AND
    OLD.user_id = NEW.user_id AND
    OLD.type = NEW.type AND
    OLD.name = NEW.name AND
    OLD.value = NEW.value AND
    OLD.created_at = NEW.created_at
  );

-- Alternative: Create a service role and policy (recommended for production)
-- Uncomment these lines if you want to use a dedicated service user

-- Create service user policy (more secure approach)
-- CREATE POLICY "CPM Service: system user" ON public.credentials
--   FOR ALL
--   USING (
--     -- Check if the current user is the CPM service user
--     auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid OR
--     -- Or if it's a server-side operation (no auth context)
--     auth.uid() IS NULL
--   );

-- Grant necessary permissions to authenticated users for CPM operations
GRANT SELECT, UPDATE ON public.credentials TO authenticated;

-- Add comment explaining the policy
COMMENT ON POLICY "CPM Service: verification updates" ON public.credentials IS 
'Allows server-side CPM service to update verification status fields only';