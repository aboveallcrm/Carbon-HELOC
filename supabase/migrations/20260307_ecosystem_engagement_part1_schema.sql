-- ============================================================
-- ECOSYSTEM ENGAGEMENT — PART 1: SCHEMA (tables, columns, indexes, RLS)
-- Run this FIRST in Supabase SQL Editor, then run Part 2.
-- All statements are idempotent (safe to re-run).
-- ============================================================

-- ============================================================
-- 1. ENGAGEMENT COLUMNS ON LEADS TABLE
-- ============================================================
-- Ensure core columns exist (may be missing depending on how table was created)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
-- Engagement tracking columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engagement_updated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_click_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_engagement_score ON leads(engagement_score DESC);

-- ============================================================
-- 2. CLICK_NOTIFICATIONS TABLE
--    Queue for pending LO notifications from link clicks.
--    Populated by the click trigger, consumed by click-notify fn.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.click_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    click_id UUID REFERENCES public.clicks(id) ON DELETE SET NULL,
    click_data JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending',  -- pending, sent, failed
    notification_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table was partially created before
ALTER TABLE click_notifications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE click_notifications ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_click_notifications_status ON click_notifications(status);
CREATE INDEX IF NOT EXISTS idx_click_notifications_user_id ON click_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_click_notifications_created ON click_notifications(created_at DESC);

ALTER TABLE click_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "click_notifications_own_select" ON click_notifications;
CREATE POLICY "click_notifications_own_select" ON click_notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "click_notifications_sa_all" ON click_notifications;
CREATE POLICY "click_notifications_sa_all" ON click_notifications
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 3. AB_TESTS TABLE
--    A/B test definitions for prompts and content variants
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    bot TEXT NOT NULL DEFAULT 'ezra',
    category TEXT NOT NULL,
    variant_a TEXT NOT NULL,
    variant_b TEXT NOT NULL,
    status TEXT DEFAULT 'active',  -- active, paused, completed
    results JSONB DEFAULT '{"a": {"sent": 0, "engaged": 0}, "b": {"sent": 0, "engaged": 0}}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table was partially created before
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS results JSONB DEFAULT '{"a": {"sent": 0, "engaged": 0}, "b": {"sent": 0, "engaged": 0}}';
ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_bot_category ON ab_tests(bot, category);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ab_tests_own_all" ON ab_tests;
CREATE POLICY "ab_tests_own_all" ON ab_tests
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ab_tests_sa_all" ON ab_tests;
CREATE POLICY "ab_tests_sa_all" ON ab_tests
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 4. QUOTE_CHAT_RATE_LIMITS TABLE
--    Persistent rate limiting for quote-chat edge function
--    (replaces in-memory Map that resets on deploy)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quote_chat_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_code TEXT NOT NULL,
    message_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_chat_rate_code ON quote_chat_rate_limits(quote_code);
CREATE INDEX IF NOT EXISTS idx_quote_chat_rate_window ON quote_chat_rate_limits(window_start);

ALTER TABLE quote_chat_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can read/write. No user policies needed.
DROP POLICY IF EXISTS "quote_chat_rate_sa_all" ON quote_chat_rate_limits;
CREATE POLICY "quote_chat_rate_sa_all" ON quote_chat_rate_limits
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- VERIFY PART 1
-- ============================================================
SELECT 'Part 1 complete — schema ready. Now run Part 2 (functions).' AS result;
