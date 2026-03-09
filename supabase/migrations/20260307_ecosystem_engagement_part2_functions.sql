-- ============================================================
-- ECOSYSTEM ENGAGEMENT — PART 2: FUNCTIONS, TRIGGERS, GRANTS
-- Run this AFTER Part 1 has completed successfully.
-- All statements are idempotent (safe to re-run).
-- ============================================================

-- ============================================================
-- SAFETY: Ensure leads columns exist before creating functions
-- (In case Part 1 was skipped or partially applied)
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engagement_updated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_click_at TIMESTAMPTZ;

-- ============================================================
-- PRE-CLEANUP: Drop functions whose signatures changed
-- (Fixes "cannot change name of input parameter" errors)
-- ============================================================
DROP FUNCTION IF EXISTS public.record_ab_outcome(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.log_prompt_usage(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_ab_tested_prompt(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.get_hot_leads(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.update_lead_engagement(UUID);
DROP FUNCTION IF EXISTS public.cleanup_quote_chat_rate_limits();

-- ============================================================
-- 1. RPC: update_lead_engagement(lead_uuid)
--    Called by quote-chat and click trigger.
--    Recalculates engagement_score from clicks + analytics.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_lead_engagement(lead_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_score INTEGER := 0;
    v_click_count INTEGER := 0;
    v_mobile_clicks INTEGER := 0;
    v_analytics_count INTEGER := 0;
    v_applied BOOLEAN := false;
BEGIN
    IF lead_uuid IS NULL THEN RETURN; END IF;

    -- Count total clicks on links associated with this lead
    SELECT COUNT(*), COUNT(*) FILTER (WHERE c.device_type = 'mobile')
    INTO v_click_count, v_mobile_clicks
    FROM public.clicks c
    JOIN public.links l ON l.id = c.link_id
    WHERE l.lead_id = lead_uuid;

    -- Count analytics events (quote views, button clicks, etc.)
    SELECT COUNT(*)
    INTO v_analytics_count
    FROM public.lead_analytics
    WHERE lead_id = lead_uuid;

    -- Check if they submitted an application
    SELECT EXISTS (
        SELECT 1 FROM public.lead_analytics
        WHERE lead_id = lead_uuid AND event_type = 'application_submitted'
    ) INTO v_applied;

    -- Calculate score
    v_score := v_click_count * 5          -- +5 per click
             + v_mobile_clicks * 3        -- +3 bonus for mobile clicks
             + v_analytics_count * 2      -- +2 per analytics event
             + CASE WHEN v_click_count > 3 THEN 10 ELSE 0 END  -- +10 repeat visitor
             + CASE WHEN v_applied THEN 20 ELSE 0 END;         -- +20 applied

    -- Update the lead
    UPDATE public.leads
    SET engagement_score = v_score,
        engagement_updated_at = now(),
        last_click_at = CASE
            WHEN v_click_count > 0 THEN (
                SELECT MAX(c.clicked_at)
                FROM public.clicks c
                JOIN public.links l ON l.id = c.link_id
                WHERE l.lead_id = lead_uuid
            )
            ELSE last_click_at
        END
    WHERE id = lead_uuid;
END;
$$;

-- ============================================================
-- 2. TRIGGER: create click_notification on new click
--    Resolves lead_id from the link, creates a notification row
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_click_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link RECORD;
BEGIN
    -- Look up the link to get user_id and lead_id
    SELECT user_id, lead_id INTO v_link
    FROM public.links WHERE id = NEW.link_id;

    IF v_link.user_id IS NOT NULL THEN
        INSERT INTO public.click_notifications (link_id, lead_id, user_id, click_id, click_data)
        VALUES (
            NEW.link_id,
            v_link.lead_id,
            v_link.user_id,
            NEW.id,
            jsonb_build_object(
                'device_type', NEW.device_type,
                'ip_hash', NEW.ip_hash,
                'referer', NEW.referer,
                'clicked_at', NEW.clicked_at
            )
        );

        -- Also update lead engagement if there's a lead
        IF v_link.lead_id IS NOT NULL THEN
            PERFORM public.update_lead_engagement(v_link.lead_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_click_notification ON public.clicks;
CREATE TRIGGER trg_click_notification
    AFTER INSERT ON public.clicks
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_click_notification();

-- ============================================================
-- 3. RPC: get_hot_leads(score_threshold, hours_window)
--    Returns high-engagement leads for the calling LO
-- ============================================================
CREATE FUNCTION public.get_hot_leads(
    score_threshold INTEGER DEFAULT 15,
    hours_window INTEGER DEFAULT 72
)
RETURNS TABLE (
    lead_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    engagement_score INTEGER,
    last_click_at TIMESTAMPTZ,
    engagement_updated_at TIMESTAMPTZ,
    source TEXT,
    stage TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.first_name,
        l.last_name,
        l.email,
        l.phone,
        l.engagement_score,
        l.last_click_at,
        l.engagement_updated_at,
        l.source,
        l.stage
    FROM public.leads l
    WHERE l.user_id = auth.uid()
      AND l.engagement_score >= score_threshold
      AND (l.engagement_updated_at IS NULL
           OR l.engagement_updated_at >= now() - (hours_window || ' hours')::interval)
    ORDER BY l.engagement_score DESC, l.last_click_at DESC NULLS LAST
    LIMIT 50;
END;
$$;

-- ============================================================
-- 4. RPC: get_ab_tested_prompt(bot, cat, lead_id)
--    Deterministic A/B variant routing by lead_id hash
-- ============================================================
CREATE FUNCTION public.get_ab_tested_prompt(
    p_bot TEXT,
    p_cat TEXT,
    p_lead_id UUID DEFAULT NULL
)
RETURNS TABLE (
    test_id UUID,
    variant TEXT,
    prompt_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_test RECORD;
    v_variant TEXT;
    v_hash_val INTEGER;
BEGIN
    -- Find active test for this bot + category
    SELECT t.* INTO v_test
    FROM public.ab_tests t
    WHERE t.bot = p_bot
      AND t.category = p_cat
      AND t.status = 'active'
    ORDER BY t.created_at DESC
    LIMIT 1;

    IF v_test IS NULL THEN
        RETURN;
    END IF;

    -- Deterministic split by lead_id hash (or random if no lead)
    IF p_lead_id IS NOT NULL THEN
        v_hash_val := abs(hashtext(p_lead_id::text)) % 2;
    ELSE
        v_hash_val := (random() * 1)::integer;
    END IF;

    IF v_hash_val = 0 THEN
        v_variant := 'a';
        RETURN QUERY SELECT v_test.id, v_variant, v_test.variant_a;
    ELSE
        v_variant := 'b';
        RETURN QUERY SELECT v_test.id, v_variant, v_test.variant_b;
    END IF;
END;
$$;

-- ============================================================
-- 5. RPC: record_ab_outcome(test_id, variant, outcome)
--    Tracks an A/B test result (engaged, converted, etc.)
-- ============================================================
CREATE FUNCTION public.record_ab_outcome(
    p_test_id UUID,
    p_variant TEXT,
    p_outcome TEXT DEFAULT 'engaged'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_variant NOT IN ('a', 'b') THEN
        RAISE EXCEPTION 'variant must be "a" or "b"';
    END IF;

    -- Increment the outcome counter in the results JSONB
    UPDATE public.ab_tests
    SET results = jsonb_set(
        results,
        ARRAY[p_variant, p_outcome],
        (COALESCE((results -> p_variant ->> p_outcome)::integer, 0) + 1)::text::jsonb
    ),
    updated_at = now()
    WHERE id = p_test_id;
END;
$$;

-- ============================================================
-- 6. RPC: log_prompt_usage(prompt_id, bot, outcome)
--     Lightweight prompt usage tracking for analytics.
--     Logs to lead_analytics with event_type = 'prompt_usage'.
-- ============================================================
CREATE FUNCTION public.log_prompt_usage(
    p_prompt_id UUID DEFAULT NULL,
    p_bot TEXT DEFAULT 'ezra',
    p_outcome TEXT DEFAULT 'sent'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.lead_analytics (user_id, event_type, event_data)
    VALUES (
        auth.uid(),
        'prompt_usage',
        jsonb_build_object(
            'prompt_id', p_prompt_id,
            'bot', p_bot,
            'outcome', p_outcome,
            'ts', now()
        )
    );
END;
$$;

-- ============================================================
-- 7. AUTO-CLEANUP: Purge old rate limit windows (> 2 hours)
--     Can be called periodically via pg_cron or manually.
-- ============================================================
CREATE FUNCTION public.cleanup_quote_chat_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.quote_chat_rate_limits
    WHERE window_start < now() - interval '2 hours';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

-- ============================================================
-- 8. GRANT EXECUTE on all RPCs to authenticated + anon
-- ============================================================
GRANT EXECUTE ON FUNCTION public.update_lead_engagement(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_hot_leads(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ab_tested_prompt(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ab_outcome(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_prompt_usage(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_quote_chat_rate_limits() TO authenticated;

-- ============================================================
-- VERIFY PART 2
-- ============================================================
SELECT 'Part 2 complete — all functions, triggers, and grants created.' AS result;
