-- Quote Links table — stores shareable client quote pages
-- Short code in URL acts as access token (publicly readable by code)
-- Drop stale table (created with wrong schema, no data)
DROP TABLE IF EXISTS public.quote_links CASCADE;

CREATE TABLE public.quote_links (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code text UNIQUE NOT NULL,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    lead_id uuid,
    quote_data jsonb NOT NULL,
    lo_info jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '90 days'),
    view_count integer DEFAULT 0
);

-- Index for fast lookups by code
CREATE INDEX IF NOT EXISTS idx_quote_links_code ON public.quote_links(code);
CREATE INDEX IF NOT EXISTS idx_quote_links_user_id ON public.quote_links(user_id);

-- Enable RLS
ALTER TABLE public.quote_links ENABLE ROW LEVEL SECURITY;

-- Anyone can read a quote link by code (it's meant to be shared with clients)
CREATE POLICY "Public read by code"
    ON public.quote_links FOR SELECT
    USING (true);

-- Users can create their own quote links
CREATE POLICY "Users can create own quote links"
    ON public.quote_links FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view/manage their own links
CREATE POLICY "Users can update own quote links"
    ON public.quote_links FOR UPDATE
    USING (auth.uid() = user_id);

-- Super Admin full access
CREATE POLICY "Super Admin full access to quote links"
    ON public.quote_links FOR ALL
    USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
