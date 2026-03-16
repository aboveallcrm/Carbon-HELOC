-- Tier Gating & Token Budget System
-- Adds: ai_token_budgets table, token RPCs, lo_tier column on quote_links

-- ============================================================
-- 1. AI Token Budgets Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_token_budgets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    period_start DATE NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    tokens_limit INTEGER NOT NULL,
    tier TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_token_budgets_user ON ai_token_budgets(user_id, period_start DESC);

ALTER TABLE ai_token_budgets ENABLE ROW LEVEL SECURITY;

-- Users can read their own budget
CREATE POLICY token_budgets_own_read ON ai_token_budgets
    FOR SELECT USING (auth.uid() = user_id);

-- Super admin full access
CREATE POLICY token_budgets_sa_all ON ai_token_budgets
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Service role can insert/update (for edge functions)
CREATE POLICY token_budgets_service_all ON ai_token_budgets
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Tier-to-Token-Limit Mapping Function
-- ============================================================
CREATE OR REPLACE FUNCTION get_tier_token_limit(p_tier TEXT)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN CASE lower(p_tier)
        WHEN 'carbon'   THEN 0
        WHEN 'titanium'  THEN 500
        WHEN 'platinum'  THEN 2000
        WHEN 'obsidian'  THEN 5000
        WHEN 'diamond'   THEN -1  -- unlimited
        ELSE 0
    END;
END;
$$;

-- ============================================================
-- 3. Get or Create Token Budget (lazy monthly reset)
-- NOTE: Return columns use budget_ prefix to avoid ambiguity
--       with ai_token_budgets table columns in PL/pgSQL body
-- ============================================================
DROP FUNCTION IF EXISTS get_or_create_token_budget(UUID);
CREATE OR REPLACE FUNCTION get_or_create_token_budget(p_user_id UUID)
RETURNS TABLE (
    budget_id UUID,
    budget_user_id UUID,
    budget_period_start DATE,
    budget_tokens_used INTEGER,
    budget_tokens_limit INTEGER,
    budget_tier TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_period DATE := date_trunc('month', now())::date;
    v_tier TEXT;
    v_limit INTEGER;
    v_row ai_token_budgets%ROWTYPE;
BEGIN
    -- Try to find existing budget for this month
    SELECT * INTO v_row FROM ai_token_budgets b
    WHERE b.user_id = p_user_id AND b.period_start = v_period;

    IF FOUND THEN
        -- Check if tier changed (user upgraded/downgraded)
        SELECT COALESCE(p.tier, 'carbon') INTO v_tier FROM profiles p WHERE p.id = p_user_id;
        v_limit := get_tier_token_limit(v_tier);

        IF v_row.tier != v_tier OR v_row.tokens_limit != v_limit THEN
            UPDATE ai_token_budgets SET tier = v_tier, tokens_limit = v_limit
            WHERE ai_token_budgets.id = v_row.id;
            v_row.tier := v_tier;
            v_row.tokens_limit := v_limit;
        END IF;

        RETURN QUERY SELECT v_row.id, v_row.user_id, v_row.period_start,
                            v_row.tokens_used, v_row.tokens_limit, v_row.tier;
        RETURN;
    END IF;

    -- No budget for this month — look up tier and create one
    SELECT COALESCE(p.tier, 'carbon') INTO v_tier FROM profiles p WHERE p.id = p_user_id;
    IF v_tier IS NULL THEN v_tier := 'carbon'; END IF;
    v_limit := get_tier_token_limit(v_tier);

    INSERT INTO ai_token_budgets (user_id, period_start, tokens_used, tokens_limit, tier)
    VALUES (p_user_id, v_period, 0, v_limit, v_tier)
    ON CONFLICT (user_id, period_start) DO NOTHING
    RETURNING * INTO v_row;

    -- If conflict (race condition), re-read
    IF v_row.id IS NULL THEN
        SELECT * INTO v_row FROM ai_token_budgets b
        WHERE b.user_id = p_user_id AND b.period_start = v_period;
    END IF;

    RETURN QUERY SELECT v_row.id, v_row.user_id, v_row.period_start,
                        v_row.tokens_used, v_row.tokens_limit, v_row.tier;
END;
$$;

-- ============================================================
-- 4. Increment Token Usage (atomic)
-- NOTE: Return columns use budget_ prefix to avoid ambiguity
-- ============================================================
DROP FUNCTION IF EXISTS increment_token_usage(UUID, INTEGER);
CREATE OR REPLACE FUNCTION increment_token_usage(p_user_id UUID, p_tokens INTEGER)
RETURNS TABLE (
    budget_tokens_used INTEGER,
    budget_tokens_limit INTEGER,
    budget_tier TEXT,
    budget_exceeded BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_row RECORD;
BEGIN
    -- Ensure budget exists
    PERFORM get_or_create_token_budget(p_user_id);

    -- Atomic increment
    UPDATE ai_token_budgets
    SET tokens_used = ai_token_budgets.tokens_used + p_tokens
    WHERE ai_token_budgets.user_id = p_user_id
      AND ai_token_budgets.period_start = date_trunc('month', now())::date
    RETURNING ai_token_budgets.tokens_used, ai_token_budgets.tokens_limit, ai_token_budgets.tier
    INTO v_row;

    RETURN QUERY SELECT v_row.tokens_used, v_row.tokens_limit, v_row.tier,
        CASE WHEN v_row.tokens_limit = -1 THEN false
             ELSE v_row.tokens_used >= v_row.tokens_limit
        END;
END;
$$;

-- ============================================================
-- 5. Add lo_tier column to quote_links
-- ============================================================
ALTER TABLE public.quote_links ADD COLUMN IF NOT EXISTS lo_tier TEXT DEFAULT 'carbon';
