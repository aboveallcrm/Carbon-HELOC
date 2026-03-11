-- ============================================================
-- PWA & PUSH NOTIFICATION SYSTEM
-- Service worker support, push subscriptions, and notification tracking
-- ============================================================

-- ============================================================
-- 1. PUSH SUBSCRIPTIONS TABLE
-- Store user push notification subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    device_info JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own subscriptions
DROP POLICY IF EXISTS "push_subscriptions_own_select" ON push_subscriptions;
CREATE POLICY "push_subscriptions_own_select" ON push_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can only update their own subscriptions
DROP POLICY IF EXISTS "push_subscriptions_own_update" ON push_subscriptions;
CREATE POLICY "push_subscriptions_own_update" ON push_subscriptions
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role can insert/update
DROP POLICY IF EXISTS "push_subscriptions_service_insert" ON push_subscriptions;
CREATE POLICY "push_subscriptions_service_insert" ON push_subscriptions
    FOR INSERT WITH CHECK (true);

-- Super admin full access
DROP POLICY IF EXISTS "push_subscriptions_sa_all" ON push_subscriptions;
CREATE POLICY "push_subscriptions_sa_all" ON push_subscriptions
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 2. PUSH NOTIFICATION LOGS
-- Track all push notifications sent
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    provider_response JSONB,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_logs_user ON push_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_status ON push_notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_push_logs_created ON push_notification_logs(created_at DESC);

ALTER TABLE push_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_logs_own_select" ON push_notification_logs;
CREATE POLICY "push_logs_own_select" ON push_notification_logs
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 3. FUNCTION: Send push notification for schedule request
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_push_for_schedule_request(
    p_request_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_client_name TEXT;
    v_client_phone TEXT;
    v_request_type TEXT;
BEGIN
    -- Get request details
    SELECT 
        user_id,
        client_name,
        client_phone,
        request_type
    INTO 
        v_user_id,
        v_client_name,
        v_client_phone,
        v_request_type
    FROM public.schedule_requests
    WHERE id = p_request_id;
    
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Log the push notification (actual sending happens via edge function)
    INSERT INTO public.push_notification_logs (
        user_id,
        notification_type,
        title,
        body,
        data,
        status
    ) VALUES (
        v_user_id,
        v_request_type,
        CASE 
            WHEN v_request_type = 'call_me_now' THEN '📞 Call Request'
            ELSE '📅 Schedule Request'
        END,
        CASE 
            WHEN v_request_type = 'call_me_now' THEN 
                COALESCE(v_client_name, 'A client') || ' wants you to call them now at ' || COALESCE(v_client_phone, 'N/A')
            ELSE 
                COALESCE(v_client_name, 'A client') || ' wants to schedule a call. Phone: ' || COALESCE(v_client_phone, 'N/A')
        END,
        jsonb_build_object(
            'request_id', p_request_id,
            'client_name', v_client_name,
            'client_phone', v_client_phone,
            'request_type', v_request_type
        ),
        'pending'
    );
END;
$$;

-- ============================================================
-- 4. TRIGGER: Auto-send push on new schedule request
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_schedule_request_push()
RETURNS TRIGGER AS $$
BEGIN
    -- Call the push notification function
    PERFORM public.send_push_for_schedule_request(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schedule_request_push ON public.schedule_requests;
CREATE TRIGGER trg_schedule_request_push
    AFTER INSERT ON public.schedule_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_schedule_request_push();

-- ============================================================
-- 5. FUNCTION: Get push config (VAPID key)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_push_config()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vapid_key TEXT;
BEGIN
    -- Get VAPID public key from app settings
    -- This should be set via environment variable or app_config table
    v_vapid_key := current_setting('app.vapid_public_key', true);
    
    RETURN jsonb_build_object(
        'vapidPublicKey', COALESCE(v_vapid_key, ''),
        'pushEnabled', v_vapid_key IS NOT NULL AND v_vapid_key != ''
    );
END;
$$;

-- ============================================================
-- 6. REALTIME ENABLEMENT
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE push_subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE push_notification_logs;

-- ============================================================
-- 7. APP CONFIG TABLE (for VAPID keys and other app settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Only super admin can modify
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_sa_all" ON app_config;
CREATE POLICY "app_config_sa_all" ON app_config
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Insert default config
INSERT INTO public.app_config (key, value, description) VALUES
    ('vapid_public_key', '', 'VAPID public key for push notifications')
ON CONFLICT (key) DO NOTHING;
