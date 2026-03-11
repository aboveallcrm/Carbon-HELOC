-- Lead Activity Table: Real-time borrower activity tracking for LO alerts
-- Feature 16: Tracks when borrowers are actively viewing their quote page

CREATE TABLE IF NOT EXISTS lead_activity (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL,
    user_id UUID NOT NULL,
    quote_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'viewing',  -- viewing, active, idle, tab_hidden, tab_visible, left
    engagement_count INT DEFAULT 0,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lead_id, quote_code)
);

-- Index for LO lookups (show all active borrowers for this LO)
CREATE INDEX IF NOT EXISTS idx_lead_activity_user_status ON lead_activity(user_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_activity_last_seen ON lead_activity(last_seen DESC);

-- RLS
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts/upserts from client quote page (no JWT required)
DROP POLICY IF EXISTS "lead_activity_anon_upsert" ON lead_activity;
CREATE POLICY "lead_activity_anon_upsert" ON lead_activity
    FOR ALL USING (true) WITH CHECK (true);

-- LO can read their own leads' activity
DROP POLICY IF EXISTS "lead_activity_lo_select" ON lead_activity;
CREATE POLICY "lead_activity_lo_select" ON lead_activity
    FOR SELECT USING (auth.uid() = user_id);

-- Super admin full access
DROP POLICY IF EXISTS "lead_activity_sa_all" ON lead_activity;
CREATE POLICY "lead_activity_sa_all" ON lead_activity
    FOR ALL USING (is_super_admin());

-- Auto-cleanup: delete entries older than 24 hours (run via cron or manual)
-- This prevents the table from growing unbounded
CREATE OR REPLACE FUNCTION cleanup_stale_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM lead_activity WHERE last_seen < NOW() - INTERVAL '24 hours';
END;
$$;

-- RPC to get currently active borrowers for an LO
CREATE OR REPLACE FUNCTION get_active_borrowers(p_user_id UUID, p_minutes INT DEFAULT 5)
RETURNS TABLE (
    lead_id UUID,
    quote_code TEXT,
    status TEXT,
    engagement_count INT,
    last_seen TIMESTAMPTZ,
    metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT la.lead_id, la.quote_code, la.status, la.engagement_count, la.last_seen, la.metadata
    FROM lead_activity la
    WHERE la.user_id = p_user_id
      AND la.status NOT IN ('left')
      AND la.last_seen > NOW() - (p_minutes || ' minutes')::INTERVAL
    ORDER BY la.last_seen DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_borrowers(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_stale_activity() TO authenticated;
