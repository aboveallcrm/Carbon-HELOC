-- Fix overly permissive lead_activity SELECT policy
-- Was: USING (true) — any authenticated user could read all rows
-- Now: Users can only read their own lead activity + super admin gets all

DROP POLICY IF EXISTS lead_activity_own_read ON lead_activity;

CREATE POLICY lead_activity_own_read ON lead_activity
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
