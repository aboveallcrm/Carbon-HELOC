-- ============================================================
-- Revised Token Budgets: More generous limits
-- The AI cascade hits Gemini Flash (free) first, so real cost
-- is near $0 for Titanium, $0-2/mo for Platinum.
-- ============================================================

CREATE OR REPLACE FUNCTION get_tier_token_limit(p_tier TEXT)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN CASE lower(p_tier)
        WHEN 'carbon'   THEN 0       -- local KB only, no API calls
        WHEN 'titanium'  THEN 5000    -- ~10-15 conversations (was 500)
        WHEN 'platinum'  THEN 25000   -- power users + lead briefings (was 2000)
        WHEN 'obsidian'  THEN 75000   -- heavy daily use + premium models (was 5000)
        WHEN 'diamond'   THEN -1      -- unlimited
        ELSE 0
    END;
END;
$$;

-- Update existing budgets for this month so new limits take effect immediately
UPDATE ai_token_budgets
SET tokens_limit = get_tier_token_limit(tier)
WHERE period_start = date_trunc('month', now())::date;
