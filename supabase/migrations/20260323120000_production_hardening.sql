-- Production hardening primitives for launch
-- Adds:
--   1. usage_events for billing/analytics
--   2. sync_errors for Bonzo/GHL failure visibility
--   3. ai_proxy_rate_limits for per-user AI request limiting

CREATE TABLE IF NOT EXISTS public.usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
    quote_id uuid NULL REFERENCES public.quotes(id) ON DELETE SET NULL,
    quote_code text NULL,
    event_type text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
    ON public.usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_type_created
    ON public.usage_events(event_type, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_own_select ON public.usage_events;
CREATE POLICY usage_events_own_select ON public.usage_events
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS usage_events_own_insert ON public.usage_events;
CREATE POLICY usage_events_own_insert ON public.usage_events
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.sync_errors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    context text NOT NULL,
    error_message text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_errors_user_created
    ON public.sync_errors(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_errors_provider_created
    ON public.sync_errors(provider, created_at DESC);

ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_errors_own_select ON public.sync_errors;
CREATE POLICY sync_errors_own_select ON public.sync_errors
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sync_errors_own_insert ON public.sync_errors;
CREATE POLICY sync_errors_own_insert ON public.sync_errors
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.ai_proxy_rate_limits (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL DEFAULT now(),
    request_count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_proxy_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_proxy_rate_limits_own_select ON public.ai_proxy_rate_limits;
CREATE POLICY ai_proxy_rate_limits_own_select ON public.ai_proxy_rate_limits
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
