-- Add value_before / value_after columns to audit_log per requested workflow schema
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS value_before JSONB,
  ADD COLUMN IF NOT EXISTS value_after JSONB;

-- Allow authenticated users to insert client-side audit entries
-- (only for their own user_id, or when no user is set for system actions)
DROP POLICY IF EXISTS "Authenticated users can insert audit log" ON public.audit_log;
CREATE POLICY "Authenticated users can insert audit log"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);