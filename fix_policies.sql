-- Fix infinite recursion in RLS policies
-- Run this in Supabase SQL Editor

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Safe permissions: owner and admin access" ON public.safe_permissions;
DROP POLICY IF EXISTS "Safes: owner and admin access" ON public.safes;

-- Create simplified non-recursive policies for safes
CREATE POLICY "Safes: basic access" ON public.safes
  FOR ALL USING (
    -- Owner can access their own safes
    owner_id = auth.uid() OR
    -- Admins and Managers can access all safes
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
    )
  );

-- Create simplified non-recursive policies for safe_permissions
CREATE POLICY "Safe permissions: basic access" ON public.safe_permissions
  FOR ALL USING (
    -- User can see their own permissions
    user_id = auth.uid() OR
    -- Safe owner can see all permissions for their safes
    safe_id IN (
      SELECT id FROM public.safes WHERE owner_id = auth.uid()
    ) OR
    -- Admins and Managers can see all permissions
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
    )
  );

-- Optional: Add separate policies for INSERT/UPDATE/DELETE if needed
CREATE POLICY "Safe permissions: insert policy" ON public.safe_permissions
  FOR INSERT WITH CHECK (
    -- Only safe owners, admins, and managers can grant permissions
    safe_id IN (
      SELECT id FROM public.safes WHERE owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
    )
  );

CREATE POLICY "Safe permissions: update policy" ON public.safe_permissions
  FOR UPDATE USING (
    -- Only safe owners, admins, and managers can update permissions
    safe_id IN (
      SELECT id FROM public.safes WHERE owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
    )
  );

CREATE POLICY "Safe permissions: delete policy" ON public.safe_permissions
  FOR DELETE USING (
    -- Only safe owners, admins, and managers can delete permissions
    safe_id IN (
      SELECT id FROM public.safes WHERE owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('Admin', 'Manager')
    )
  );
