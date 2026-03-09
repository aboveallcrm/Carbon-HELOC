-- HeyGen AI Video Generation Cache Table
-- Stores generated video metadata for async polling and caching

CREATE TABLE IF NOT EXISTS heygen_videos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    quote_link_code text,
    heygen_video_id text NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    video_url text,
    thumbnail_url text,
    script_text text,
    script_variables jsonb,
    duration_seconds int,
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    error_message text
);

-- Index for fast polling lookups
CREATE INDEX IF NOT EXISTS idx_heygen_videos_video_id ON heygen_videos (heygen_video_id);
CREATE INDEX IF NOT EXISTS idx_heygen_videos_code ON heygen_videos (quote_link_code) WHERE quote_link_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_heygen_videos_user ON heygen_videos (user_id);

-- RLS
ALTER TABLE heygen_videos ENABLE ROW LEVEL SECURITY;

-- Users can read/insert their own rows
DROP POLICY IF EXISTS heygen_videos_own_select ON heygen_videos;
CREATE POLICY heygen_videos_own_select ON heygen_videos
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS heygen_videos_own_insert ON heygen_videos;
CREATE POLICY heygen_videos_own_insert ON heygen_videos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Super admin full access (hardcoded UUID to avoid recursion)
DROP POLICY IF EXISTS heygen_videos_sa_all ON heygen_videos;
CREATE POLICY heygen_videos_sa_all ON heygen_videos
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Public read by quote_link_code (for client-page deferred polling)
DROP POLICY IF EXISTS heygen_videos_public_read_by_code ON heygen_videos;
CREATE POLICY heygen_videos_public_read_by_code ON heygen_videos
    FOR SELECT USING (quote_link_code IS NOT NULL);
