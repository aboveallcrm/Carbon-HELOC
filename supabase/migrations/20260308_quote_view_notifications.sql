-- ============================================================
-- QUOTE VIEW NOTIFICATIONS
-- Real-time alerts for LOs when clients open their quote links.
-- Populated by track-quote-view edge function, consumed by the main tool.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quote_view_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    quote_code TEXT,
    client_name TEXT DEFAULT '',
    device TEXT DEFAULT 'desktop',
    seen BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qvn_user_unseen ON quote_view_notifications(user_id, seen, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qvn_created ON quote_view_notifications(created_at DESC);

ALTER TABLE quote_view_notifications ENABLE ROW LEVEL SECURITY;

-- LOs can see their own notifications
DROP POLICY IF EXISTS "qvn_own_select" ON quote_view_notifications;
CREATE POLICY "qvn_own_select" ON quote_view_notifications
    FOR SELECT USING (auth.uid() = user_id);

-- LOs can mark their own as seen
DROP POLICY IF EXISTS "qvn_own_update" ON quote_view_notifications;
CREATE POLICY "qvn_own_update" ON quote_view_notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Super admin full access
DROP POLICY IF EXISTS "qvn_sa_all" ON quote_view_notifications;
CREATE POLICY "qvn_sa_all" ON quote_view_notifications
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Service role inserts (from edge function) bypass RLS, no anon insert policy needed
