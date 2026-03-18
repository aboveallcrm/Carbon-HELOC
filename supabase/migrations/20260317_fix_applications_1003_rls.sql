-- Fix applications_1003 RLS: remove OR true from SELECT, restrict INSERT
-- The original public_select_own_1003 had "OR true" making all PII publicly readable

-- 1. Drop broken SELECT policy
DROP POLICY IF EXISTS "public_select_own_1003" ON applications_1003;

-- 2. Anon cannot read applications directly
CREATE POLICY "anon_select_by_confirmation" ON applications_1003
  FOR SELECT TO anon
  USING (false);

-- 3. Authenticated users see their own (by email or as LO)
CREATE POLICY "auth_select_own_1003" ON applications_1003
  FOR SELECT TO authenticated
  USING (
    email = (current_setting('request.jwt.claims', true)::json->>'email')
    OR lo_user_id = auth.uid()
  );

-- 4. INSERT requires email + lo_user_id
DROP POLICY IF EXISTS "public_insert_1003" ON applications_1003;
CREATE POLICY "public_insert_1003" ON applications_1003
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND lo_user_id IS NOT NULL
  );

-- 5. Super admin full access
DROP POLICY IF EXISTS "sa_all_1003" ON applications_1003;
CREATE POLICY "sa_all_1003" ON applications_1003
  FOR ALL TO authenticated
  USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid)
  WITH CHECK (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
