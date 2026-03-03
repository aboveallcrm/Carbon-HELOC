-- Fix clicks RLS: ensure anon and authenticated can insert
-- The clicks table was pre-existing and our policies may not have applied

-- Drop all existing policies to start fresh
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'clicks' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.clicks';
    END LOOP;
END$$;

-- Recreate clean policies
-- Anyone can insert clicks (edge function + public redirect)
CREATE POLICY "Anyone insert clicks" ON public.clicks
    FOR INSERT WITH CHECK (true);

-- Users can read clicks on their own links
CREATE POLICY "Users read own clicks" ON public.clicks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.links WHERE links.id = clicks.link_id AND links.user_id = auth.uid())
    );

-- Super Admin full access
CREATE POLICY "Super Admin clicks" ON public.clicks
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Also fix links policies while we're at it
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'links' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.links';
    END LOOP;
END$$;

-- Public can read any link (needed for redirect lookup)
CREATE POLICY "Public read links" ON public.links
    FOR SELECT USING (true);

-- Users can create their own links
CREATE POLICY "Users create own links" ON public.links
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own links
CREATE POLICY "Users update own links" ON public.links
    FOR UPDATE USING (auth.uid() = user_id);

-- Super Admin full access to links
CREATE POLICY "Super Admin links" ON public.links
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Anon can insert links (for the RPC which is SECURITY DEFINER anyway)
-- But also allow anon to read for redirect
CREATE POLICY "Anon read links" ON public.links
    FOR SELECT TO anon USING (true);
