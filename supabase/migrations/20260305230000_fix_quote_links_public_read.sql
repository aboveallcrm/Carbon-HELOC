-- Fix quote_links: ensure public read access and add missing columns
-- The client-quote.html page reads quote_links as an unauthenticated user (anon key)
-- so we need a public SELECT policy that allows reading by code.

-- Add missing columns used by generateClientLink()
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='quote_links' AND column_name='short_url') THEN
        ALTER TABLE public.quote_links ADD COLUMN short_url text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='quote_links' AND column_name='short_link_id') THEN
        ALTER TABLE public.quote_links ADD COLUMN short_link_id uuid;
    END IF;
END $$;

-- Enable RLS (idempotent)
ALTER TABLE public.quote_links ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to recreate cleanly
DROP POLICY IF EXISTS "Public read by code" ON public.quote_links;
DROP POLICY IF EXISTS "Anyone can read quote links" ON public.quote_links;
DROP POLICY IF EXISTS "Users can create own quote links" ON public.quote_links;
DROP POLICY IF EXISTS "Users can update own quote links" ON public.quote_links;
DROP POLICY IF EXISTS "Super Admin full access to quote links" ON public.quote_links;
DROP POLICY IF EXISTS "Public can update view count" ON public.quote_links;

-- Public read: clients (unauthenticated) must be able to fetch their quote
CREATE POLICY "Anyone can read quote links"
    ON public.quote_links FOR SELECT
    TO anon, authenticated
    USING (true);

-- Public update: allow anon to increment view_count
CREATE POLICY "Public can update view count"
    ON public.quote_links FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- Authenticated users can create their own links
CREATE POLICY "Users can create own quote links"
    ON public.quote_links FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own links
CREATE POLICY "Users can update own quote links"
    ON public.quote_links FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- Super Admin full access
CREATE POLICY "Super Admin full access to quote links"
    ON public.quote_links FOR ALL
    TO authenticated
    USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
