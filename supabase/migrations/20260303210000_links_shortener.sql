-- ============================================================
-- Link Shortener Infrastructure
-- Creates: links table, clicks table, RPC functions, triggers
-- ============================================================

-- ─── 1. LINKS TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    destination_url text NOT NULL,
    short_url text,
    domain text DEFAULT 'go.aboveallcrm.com',
    title text,
    category text DEFAULT 'general',
    user_id uuid REFERENCES auth.users(id),
    lead_id uuid,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    click_count integer DEFAULT 0,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Ensure all columns exist (table may have been partially created before)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='links' AND column_name='click_count') THEN
        ALTER TABLE public.links ADD COLUMN click_count integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='links' AND column_name='expires_at') THEN
        ALTER TABLE public.links ADD COLUMN expires_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='links' AND column_name='lead_id') THEN
        ALTER TABLE public.links ADD COLUMN lead_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='links' AND column_name='utm_source') THEN
        ALTER TABLE public.links ADD COLUMN utm_source text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='links' AND column_name='utm_medium') THEN
        ALTER TABLE public.links ADD COLUMN utm_medium text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='links' AND column_name='utm_campaign') THEN
        ALTER TABLE public.links ADD COLUMN utm_campaign text;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_links_slug ON public.links(slug);
CREATE INDEX IF NOT EXISTS idx_links_user_id ON public.links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_lead_id ON public.links(lead_id);

ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Public read links" ON public.links;
DROP POLICY IF EXISTS "Users create own links" ON public.links;
DROP POLICY IF EXISTS "Users update own links" ON public.links;
DROP POLICY IF EXISTS "Super Admin links" ON public.links;
DROP POLICY IF EXISTS "Anon read links" ON public.links;

-- Public can read any link (needed for redirect lookup)
CREATE POLICY "Public read links" ON public.links
    FOR SELECT USING (true);

-- Users can create their own links
CREATE POLICY "Users create own links" ON public.links
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own links
CREATE POLICY "Users update own links" ON public.links
    FOR UPDATE USING (auth.uid() = user_id);

-- Super Admin full access
CREATE POLICY "Super Admin links" ON public.links
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Anon can read (for edge function redirect lookups without JWT)
CREATE POLICY "Anon read links" ON public.links
    FOR SELECT TO anon USING (true);


-- ─── 2. CLICKS TABLE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clicks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id uuid REFERENCES public.links(id) ON DELETE CASCADE NOT NULL,
    clicked_at timestamptz DEFAULT now(),
    ip_hash text,
    user_agent text,
    referer text,
    device_type text,
    country text,
    city text
);

CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON public.clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at ON public.clicks(clicked_at);

ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Anon insert clicks" ON public.clicks;
DROP POLICY IF EXISTS "Auth insert clicks" ON public.clicks;
DROP POLICY IF EXISTS "Users read own clicks" ON public.clicks;
DROP POLICY IF EXISTS "Super Admin clicks" ON public.clicks;

-- Anon can insert clicks (edge function uses anon key)
CREATE POLICY "Anon insert clicks" ON public.clicks
    FOR INSERT TO anon WITH CHECK (true);

-- Authenticated users insert clicks too
CREATE POLICY "Auth insert clicks" ON public.clicks
    FOR INSERT WITH CHECK (true);

-- Users can read clicks on their own links
CREATE POLICY "Users read own clicks" ON public.clicks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.links WHERE links.id = clicks.link_id AND links.user_id = auth.uid())
    );

-- Super Admin full access
CREATE POLICY "Super Admin clicks" ON public.clicks
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);


-- ─── 3. ADD short_link_id / short_url TO quote_links ────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='quote_links' AND column_name='short_link_id') THEN
        ALTER TABLE public.quote_links ADD COLUMN short_link_id uuid REFERENCES public.links(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='quote_links' AND column_name='short_url') THEN
        ALTER TABLE public.quote_links ADD COLUMN short_url text;
    END IF;
END$$;


-- ─── 4. create_short_link RPC ───────────────────────────────
-- Drop ALL existing overloads to avoid ambiguity
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure::text AS sig
             FROM pg_proc WHERE proname = 'create_short_link' AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
    END LOOP;
END$$;
CREATE OR REPLACE FUNCTION public.create_short_link(
    p_destination_url text,
    p_title text DEFAULT 'Short Link',
    p_category text DEFAULT 'general',
    p_domain text DEFAULT 'go.aboveallcrm.com',
    p_custom_slug text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_lead_id uuid DEFAULT NULL,
    p_utm_source text DEFAULT NULL,
    p_utm_medium text DEFAULT NULL,
    p_utm_campaign text DEFAULT NULL
)
RETURNS TABLE (
    out_id uuid,
    out_short_url text,
    out_slug text,
    out_destination_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slug text;
    v_id uuid;
    v_short_url text;
    v_domain text;
    v_attempts int := 0;
BEGIN
    -- Normalize domain
    v_domain := COALESCE(NULLIF(TRIM(p_domain), ''), 'go.aboveallcrm.com');
    -- Ensure domain has proper prefix
    IF v_domain NOT LIKE 'http%' THEN
        v_domain := 'https://' || v_domain;
    END IF;

    -- Use custom slug or generate random one
    IF p_custom_slug IS NOT NULL AND TRIM(p_custom_slug) <> '' THEN
        v_slug := TRIM(p_custom_slug);
        -- Check for collision
        IF EXISTS (SELECT 1 FROM public.links WHERE slug = v_slug) THEN
            RAISE EXCEPTION 'Slug "%" already exists', v_slug;
        END IF;
    ELSE
        -- Generate a 6-char alphanumeric slug, retry on collision
        LOOP
            v_slug := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.links WHERE slug = v_slug);
            v_attempts := v_attempts + 1;
            IF v_attempts > 10 THEN
                -- Extend to 8 chars after 10 attempts
                v_slug := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
                EXIT WHEN NOT EXISTS (SELECT 1 FROM public.links WHERE slug = v_slug);
                RAISE EXCEPTION 'Could not generate unique slug';
            END IF;
        END LOOP;
    END IF;

    v_short_url := v_domain || '/' || v_slug;

    INSERT INTO public.links (slug, destination_url, short_url, domain, title, category,
                              user_id, lead_id, utm_source, utm_medium, utm_campaign)
    VALUES (v_slug, p_destination_url, v_short_url, v_domain, p_title, p_category,
            p_user_id, p_lead_id, p_utm_source, p_utm_medium, p_utm_campaign)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_short_url, v_slug, p_destination_url;
END;
$$;


-- ─── 5. get_link_stats RPC ──────────────────────────────────
DROP FUNCTION IF EXISTS public.get_link_stats(text);
CREATE OR REPLACE FUNCTION public.get_link_stats(p_slug text)
RETURNS TABLE (
    total_clicks bigint,
    unique_devices bigint,
    last_click timestamptz,
    top_device text,
    top_city text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link_id uuid;
BEGIN
    SELECT id INTO v_link_id FROM public.links WHERE slug = p_slug;
    IF v_link_id IS NULL THEN
        RETURN QUERY SELECT 0::bigint, 0::bigint, NULL::timestamptz, NULL::text, NULL::text;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_clicks,
        COUNT(DISTINCT c.ip_hash)::bigint AS unique_devices,
        MAX(c.clicked_at) AS last_click,
        (SELECT c2.device_type FROM public.clicks c2
         WHERE c2.link_id = v_link_id AND c2.device_type IS NOT NULL
         GROUP BY c2.device_type ORDER BY COUNT(*) DESC LIMIT 1) AS top_device,
        (SELECT c3.city FROM public.clicks c3
         WHERE c3.link_id = v_link_id AND c3.city IS NOT NULL
         GROUP BY c3.city ORDER BY COUNT(*) DESC LIMIT 1) AS top_city
    FROM public.clicks c
    WHERE c.link_id = v_link_id;
END;
$$;


-- ─── 6. TRIGGER: increment click_count on links ─────────────
CREATE OR REPLACE FUNCTION public.increment_link_clicks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.links SET click_count = click_count + 1 WHERE id = NEW.link_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_link_clicks ON public.clicks;
CREATE TRIGGER trg_increment_link_clicks
    AFTER INSERT ON public.clicks
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_link_clicks();


-- ─── 7. Grant execute on RPCs to anon + authenticated ───────
GRANT EXECUTE ON FUNCTION public.create_short_link(text, text, text, text, text, uuid, uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_link_stats(text) TO anon, authenticated;
