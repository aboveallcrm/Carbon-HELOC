-- ============================================================
-- EZRA SCHEDULING & NOTIFICATION SYSTEM
-- Comprehensive scheduling features: Call Me Now, SMS/Email alerts,
-- Calendar booking, and CRM integration for call notifications
-- ============================================================

-- ============================================================
-- 1. LO NOTIFICATION PREFERENCES
-- Store LO preferences for SMS, email, CRM webhooks
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS crm_webhook_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS crm_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS crm_type TEXT DEFAULT 'none'; -- 'none', 'ghl', 'salesforce', 'hubspot', 'custom'

-- ============================================================
-- 2. SCHEDULE REQUESTS TABLE
-- Clients requesting calls or scheduling via Ezra
-- ============================================================
CREATE TABLE IF NOT EXISTS public.schedule_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    quote_code TEXT,
    client_name TEXT DEFAULT '',
    client_phone TEXT,
    client_email TEXT,
    request_type TEXT NOT NULL DEFAULT 'schedule_call', -- 'schedule_call', 'call_me_now', 'book_appointment'
    preferred_time TEXT, -- 'asap', 'morning', 'afternoon', 'evening', or specific time
    status TEXT DEFAULT 'pending', -- 'pending', 'notified', 'contacted', 'completed', 'cancelled'
    notification_sent BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMPTZ,
    crm_synced BOOLEAN DEFAULT false,
    crm_synced_at TIMESTAMPTZ,
    crm_response JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_requests_user_status ON schedule_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_schedule_requests_created ON schedule_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_requests_pending ON schedule_requests(status) WHERE status = 'pending';

ALTER TABLE schedule_requests ENABLE ROW LEVEL SECURITY;

-- LOs can see their own schedule requests
DROP POLICY IF EXISTS "schedule_requests_own_select" ON schedule_requests;
CREATE POLICY "schedule_requests_own_select" ON schedule_requests
    FOR SELECT USING (auth.uid() = user_id);

-- LOs can update their own schedule requests
DROP POLICY IF EXISTS "schedule_requests_own_update" ON schedule_requests;
CREATE POLICY "schedule_requests_own_update" ON schedule_requests
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role can insert (from edge function)
DROP POLICY IF EXISTS "schedule_requests_service_insert" ON schedule_requests;
CREATE POLICY "schedule_requests_service_insert" ON schedule_requests
    FOR INSERT WITH CHECK (true);

-- Super admin full access
DROP POLICY IF EXISTS "schedule_requests_sa_all" ON schedule_requests;
CREATE POLICY "schedule_requests_sa_all" ON schedule_requests
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 3. NOTIFICATION LOGS TABLE
-- Track all SMS/email notifications sent
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    schedule_request_id UUID REFERENCES public.schedule_requests(id) ON DELETE SET NULL,
    notification_type TEXT NOT NULL, -- 'sms', 'email', 'webhook', 'push'
    recipient TEXT NOT NULL,
    subject TEXT,
    content TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'delivered'
    provider_response JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_logs_own_select" ON notification_logs;
CREATE POLICY "notification_logs_own_select" ON notification_logs
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 4. CALENDAR BOOKINGS TABLE
-- Track calendar bookings made via Ezra
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    quote_code TEXT,
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    booking_type TEXT DEFAULT 'calendly', -- 'calendly', 'ghl', 'manual', 'api'
    booking_url TEXT,
    scheduled_at TIMESTAMPTZ,
    calendar_event_id TEXT,
    calendar_provider TEXT, -- 'calendly', 'google', 'outlook', 'ghl'
    status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_bookings_user ON calendar_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_bookings_scheduled ON calendar_bookings(scheduled_at);

ALTER TABLE calendar_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_bookings_own_select" ON calendar_bookings;
CREATE POLICY "calendar_bookings_own_select" ON calendar_bookings
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 5. FUNCTION: Create schedule request and trigger notification
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_schedule_request(
    p_user_id UUID,
    p_lead_id UUID,
    p_quote_code TEXT,
    p_client_name TEXT,
    p_client_phone TEXT,
    p_client_email TEXT,
    p_request_type TEXT DEFAULT 'schedule_call',
    p_preferred_time TEXT DEFAULT 'asap',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request_id UUID;
BEGIN
    INSERT INTO public.schedule_requests (
        user_id,
        lead_id,
        quote_code,
        client_name,
        client_phone,
        client_email,
        request_type,
        preferred_time,
        metadata
    ) VALUES (
        p_user_id,
        p_lead_id,
        p_quote_code,
        p_client_name,
        p_client_phone,
        p_client_email,
        p_request_type,
        p_preferred_time,
        p_metadata
    )
    RETURNING id INTO v_request_id;
    
    RETURN v_request_id;
END;
$$;

-- ============================================================
-- 6. FUNCTION: Mark schedule request as notified
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_schedule_notified(
    p_request_id UUID,
    p_crm_synced BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.schedule_requests
    SET 
        status = 'notified',
        notification_sent = true,
        notification_sent_at = now(),
        crm_synced = p_crm_synced,
        crm_synced_at = CASE WHEN p_crm_synced THEN now() ELSE null END,
        updated_at = now()
    WHERE id = p_request_id;
END;
$$;

-- ============================================================
-- 7. FUNCTION: Get pending schedule requests for a user
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pending_schedule_requests(
    p_user_id UUID
)
RETURNS TABLE (
    id UUID,
    lead_id UUID,
    quote_code TEXT,
    client_name TEXT,
    client_phone TEXT,
    client_email TEXT,
    request_type TEXT,
    preferred_time TEXT,
    created_at TIMESTAMPTZ,
    minutes_ago INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sr.id,
        sr.lead_id,
        sr.quote_code,
        sr.client_name,
        sr.client_phone,
        sr.client_email,
        sr.request_type,
        sr.preferred_time,
        sr.created_at,
        EXTRACT(MINUTE FROM (now() - sr.created_at))::INTEGER as minutes_ago
    FROM public.schedule_requests sr
    WHERE sr.user_id = p_user_id
        AND sr.status IN ('pending', 'notified')
    ORDER BY sr.created_at DESC;
END;
$$;

-- ============================================================
-- 8. REALTIME ENABLEMENT
-- Enable realtime for schedule_requests so LOs get instant updates
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_requests;

-- ============================================================
-- 9. TRIGGER: Update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_schedule_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schedule_requests_updated_at ON public.schedule_requests;
CREATE TRIGGER trg_schedule_requests_updated_at
    BEFORE UPDATE ON public.schedule_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_schedule_request_updated_at();
