-- AI Usage Analytics: track every AI proxy call with token counts and cost estimates
-- Used by Super Admin dashboard and per-user usage visibility

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    action TEXT NOT NULL,
    intent TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_usage_user ON ai_usage_log(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_provider ON ai_usage_log(provider, created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY ai_usage_own_read ON ai_usage_log
    FOR SELECT USING (auth.uid() = user_id);

-- Super admin (Eddie) full access
CREATE POLICY ai_usage_sa_all ON ai_usage_log
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Service role inserts from edge functions
CREATE POLICY ai_usage_service_insert ON ai_usage_log
    FOR INSERT WITH CHECK (true);

-- RPC: Usage summary grouped by user/provider/model
CREATE OR REPLACE FUNCTION get_ai_usage_summary(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    user_email TEXT,
    provider TEXT,
    model TEXT,
    total_calls BIGINT,
    total_input_tokens BIGINT,
    total_output_tokens BIGINT,
    total_cost NUMERIC
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT p.email::TEXT, a.provider, a.model,
        COUNT(*), SUM(a.input_tokens), SUM(a.output_tokens),
        SUM(a.estimated_cost_usd)
    FROM ai_usage_log a
    JOIN auth.users p ON p.id = a.user_id
    WHERE a.created_at > now() - (days_back || ' days')::interval
    GROUP BY p.email, a.provider, a.model
    ORDER BY SUM(a.estimated_cost_usd) DESC;
$$;

-- RPC: Usage by intent/feature
CREATE OR REPLACE FUNCTION get_ai_usage_by_intent(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    intent TEXT,
    total_calls BIGINT,
    total_cost NUMERIC
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT COALESCE(a.intent, 'unknown'), COUNT(*), SUM(a.estimated_cost_usd)
    FROM ai_usage_log a
    WHERE a.created_at > now() - (days_back || ' days')::interval
    GROUP BY a.intent
    ORDER BY COUNT(*) DESC;
$$;
