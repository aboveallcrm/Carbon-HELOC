-- ============================================================
-- Smart Automations: Zero-config alerts for LOs
-- Tier-gated: Titanium+ gets hot lead/apply/repeat visitor,
--             Platinum+ gets stale lead nudge + quote expiry
-- Delivery: in-app toast + email (Resend), optional n8n webhook
-- ============================================================

-- 1. automation_alerts table (mirrors quote_view_notifications pattern)
CREATE TABLE IF NOT EXISTS public.automation_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,  -- hot_lead, application_submitted, repeat_visitor, stale_lead, quote_expiry
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    payload JSONB DEFAULT '{}',
    delivered_email BOOLEAN DEFAULT false,
    delivered_webhook BOOLEAN DEFAULT false,
    seen BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_alerts_user_unseen ON automation_alerts(user_id, seen, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_alerts_event ON automation_alerts(event_type, created_at DESC);

ALTER TABLE automation_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_alerts_own_select" ON automation_alerts;
CREATE POLICY "auto_alerts_own_select" ON automation_alerts
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "auto_alerts_own_update" ON automation_alerts;
CREATE POLICY "auto_alerts_own_update" ON automation_alerts
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "auto_alerts_sa_all" ON automation_alerts;
CREATE POLICY "auto_alerts_sa_all" ON automation_alerts
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- Service role inserts bypass RLS (edge functions use service role)


-- 2. Add event_type column to click_notifications for backwards compat
ALTER TABLE click_notifications ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'link_clicked';


-- 3. Helper: get user tier level (used in triggers for gating)
CREATE OR REPLACE FUNCTION public.get_user_tier_level(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
    v_tier TEXT;
    v_role TEXT;
BEGIN
    SELECT tier, role INTO v_tier, v_role FROM public.profiles WHERE id = p_user_id;
    IF v_role = 'super_admin' THEN RETURN 4; END IF;
    RETURN CASE lower(COALESCE(v_tier, 'carbon'))
        WHEN 'carbon'   THEN 0
        WHEN 'titanium'  THEN 1
        WHEN 'platinum'  THEN 2
        WHEN 'obsidian'  THEN 3
        WHEN 'diamond'   THEN 4
        ELSE 0
    END;
END;
$$;


-- 4. Trigger: Hot Lead Alert (fires when engagement_score crosses threshold)
-- Runs on leads table UPDATE, checks if score just crossed 15
CREATE OR REPLACE FUNCTION public.trg_hot_lead_alert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tier_level INTEGER;
    v_lead_name TEXT;
    v_click_count INTEGER;
BEGIN
    -- Only fire when score crosses 15 (wasn't >= 15 before, is now)
    IF (OLD.engagement_score IS NULL OR OLD.engagement_score < 15)
       AND NEW.engagement_score >= 15 THEN

        v_tier_level := public.get_user_tier_level(NEW.user_id);
        -- Titanium+ only (level >= 1)
        IF v_tier_level >= 1 THEN
            v_lead_name := COALESCE(NULLIF(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), ''), NEW.email, 'Unknown Lead');

            SELECT COUNT(*) INTO v_click_count FROM public.clicks c
                JOIN public.links l ON l.id = c.link_id
                WHERE l.lead_id = NEW.id;

            INSERT INTO public.automation_alerts (user_id, lead_id, event_type, title, body, payload)
            VALUES (
                NEW.user_id,
                NEW.id,
                'hot_lead',
                'Hot Lead: ' || v_lead_name,
                v_lead_name || ' has an engagement score of ' || NEW.engagement_score || ' (' || v_click_count || ' quote views). This is a strong buying signal — call or text now.',
                jsonb_build_object(
                    'lead_name', v_lead_name,
                    'engagement_score', NEW.engagement_score,
                    'click_count', v_click_count,
                    'email', NEW.email,
                    'phone', NEW.phone
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hot_lead_alert ON public.leads;
CREATE TRIGGER trg_hot_lead_alert
    AFTER UPDATE OF engagement_score ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_hot_lead_alert();


-- 5. Trigger: Repeat Visitor Alert (fires on 3rd+ click for same lead)
-- Enhanced trg_click_notification to also detect repeat visitors
CREATE OR REPLACE FUNCTION public.trg_repeat_visitor_alert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_link RECORD;
    v_tier_level INTEGER;
    v_click_count INTEGER;
    v_lead_name TEXT;
    v_lead RECORD;
BEGIN
    SELECT user_id, lead_id INTO v_link FROM public.links WHERE id = NEW.link_id;

    IF v_link.user_id IS NOT NULL AND v_link.lead_id IS NOT NULL THEN
        v_tier_level := public.get_user_tier_level(v_link.user_id);
        -- Titanium+ only
        IF v_tier_level >= 1 THEN
            -- Count total clicks for this lead across all their links
            SELECT COUNT(*) INTO v_click_count FROM public.clicks c
                JOIN public.links l ON l.id = c.link_id
                WHERE l.lead_id = v_link.lead_id;

            -- Only fire on exactly 3 clicks (avoid spamming on 4th, 5th, etc.)
            -- Fire again at 5 and 10 for persistent interest
            IF v_click_count IN (3, 5, 10) THEN
                SELECT first_name, last_name, email INTO v_lead
                FROM public.leads WHERE id = v_link.lead_id;

                v_lead_name := COALESCE(
                    NULLIF(TRIM(COALESCE(v_lead.first_name, '') || ' ' || COALESCE(v_lead.last_name, '')), ''),
                    v_lead.email,
                    'A client'
                );

                INSERT INTO public.automation_alerts (user_id, lead_id, event_type, title, body, payload)
                VALUES (
                    v_link.user_id,
                    v_link.lead_id,
                    'repeat_visitor',
                    v_lead_name || ' is looking at your quote again',
                    v_lead_name || ' has viewed your quote ' || v_click_count || ' times'
                        || CASE WHEN NEW.device_type = 'mobile' THEN ' (from their phone)' ELSE '' END
                        || '. They''re actively considering — reach out now.',
                    jsonb_build_object(
                        'lead_name', v_lead_name,
                        'click_count', v_click_count,
                        'device_type', NEW.device_type,
                        'clicked_at', NEW.clicked_at
                    )
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repeat_visitor_alert ON public.clicks;
CREATE TRIGGER trg_repeat_visitor_alert
    AFTER INSERT ON public.clicks
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_repeat_visitor_alert();


-- 6. Trigger: Application Started Alert
-- Fires when lead_analytics gets an 'application_submitted' event
CREATE OR REPLACE FUNCTION public.trg_application_alert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_lead RECORD;
    v_tier_level INTEGER;
    v_lead_name TEXT;
BEGIN
    IF NEW.event_type = 'application_submitted' AND NEW.user_id IS NOT NULL THEN
        v_tier_level := public.get_user_tier_level(NEW.user_id);
        -- Titanium+ only
        IF v_tier_level >= 1 THEN
            IF NEW.lead_id IS NOT NULL THEN
                SELECT first_name, last_name, email, phone INTO v_lead FROM public.leads WHERE id = NEW.lead_id;
                v_lead_name := COALESCE(NULLIF(TRIM(COALESCE(v_lead.first_name, '') || ' ' || COALESCE(v_lead.last_name, '')), ''), v_lead.email, 'A client');
            ELSE
                v_lead_name := COALESCE(NEW.event_data->>'client_name', 'A client');
            END IF;

            INSERT INTO public.automation_alerts (user_id, lead_id, event_type, title, body, payload)
            VALUES (
                NEW.user_id,
                NEW.lead_id,
                'application_submitted',
                v_lead_name || ' clicked Apply Now!',
                v_lead_name || ' just started a HELOC application from your quote link. Call them within the hour while they''re engaged.',
                jsonb_build_object(
                    'lead_name', v_lead_name,
                    'email', COALESCE(v_lead.email, ''),
                    'phone', COALESCE(v_lead.phone, ''),
                    'device', COALESCE(NEW.event_data->>'device', 'unknown'),
                    'quote_code', COALESCE(NEW.event_data->>'quote_code', '')
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_alert ON public.lead_analytics;
CREATE TRIGGER trg_application_alert
    AFTER INSERT ON public.lead_analytics
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_application_alert();


-- 7. Function: check_stale_leads (called by automation-scheduler edge function)
-- Finds leads with quote_links created > 48hrs ago + engagement_score = 0
-- Platinum+ only (level >= 2)
CREATE OR REPLACE FUNCTION public.check_stale_leads()
RETURNS TABLE (
    alert_user_id UUID,
    alert_lead_id UUID,
    lead_name TEXT,
    lead_email TEXT,
    lead_phone TEXT,
    quote_code TEXT,
    quote_created_at TIMESTAMPTZ,
    hours_since_sent NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (ql.lead_id)
        ql.user_id AS alert_user_id,
        ql.lead_id AS alert_lead_id,
        COALESCE(NULLIF(TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''), l.email, 'Unknown') AS lead_name,
        l.email AS lead_email,
        l.phone AS lead_phone,
        ql.code AS quote_code,
        ql.created_at AS quote_created_at,
        ROUND(EXTRACT(EPOCH FROM (now() - ql.created_at)) / 3600, 1) AS hours_since_sent
    FROM public.quote_links ql
    JOIN public.leads l ON l.id = ql.lead_id
    JOIN public.profiles p ON p.id = ql.user_id
    WHERE ql.lead_id IS NOT NULL
      AND ql.created_at < now() - INTERVAL '48 hours'
      AND ql.created_at > now() - INTERVAL '7 days'  -- don't alert on very old quotes
      AND (l.engagement_score IS NULL OR l.engagement_score = 0)
      AND public.get_user_tier_level(ql.user_id) >= 2  -- Platinum+ only
      -- Don't alert if we already sent a stale_lead alert for this lead in the last 72 hours
      AND NOT EXISTS (
          SELECT 1 FROM public.automation_alerts aa
          WHERE aa.lead_id = ql.lead_id
            AND aa.user_id = ql.user_id
            AND aa.event_type = 'stale_lead'
            AND aa.created_at > now() - INTERVAL '72 hours'
      )
    ORDER BY ql.lead_id, ql.created_at DESC;
END;
$$;


-- 8. Function: check_expiring_quotes (called by automation-scheduler)
-- Finds quote_links expiring within 24 hours
-- Platinum+ only (level >= 2)
CREATE OR REPLACE FUNCTION public.check_expiring_quotes()
RETURNS TABLE (
    alert_user_id UUID,
    alert_lead_id UUID,
    lead_name TEXT,
    lead_email TEXT,
    quote_code TEXT,
    expires_at TIMESTAMPTZ,
    hours_until_expiry NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (ql.lead_id)
        ql.user_id AS alert_user_id,
        ql.lead_id AS alert_lead_id,
        COALESCE(NULLIF(TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''), l.email, 'Unknown') AS lead_name,
        l.email AS lead_email,
        ql.code AS quote_code,
        ql.expires_at AS expires_at,
        ROUND(EXTRACT(EPOCH FROM (ql.expires_at - now())) / 3600, 1) AS hours_until_expiry
    FROM public.quote_links ql
    LEFT JOIN public.leads l ON l.id = ql.lead_id
    WHERE ql.expires_at IS NOT NULL
      AND ql.expires_at > now()
      AND ql.expires_at < now() + INTERVAL '24 hours'
      AND public.get_user_tier_level(ql.user_id) >= 2  -- Platinum+ only
      -- Don't alert if we already sent an expiry alert for this quote
      AND NOT EXISTS (
          SELECT 1 FROM public.automation_alerts aa
          WHERE aa.payload->>'quote_code' = ql.code
            AND aa.event_type = 'quote_expiry'
      )
    ORDER BY ql.lead_id, ql.expires_at ASC;
END;
$$;


-- Grants
GRANT EXECUTE ON FUNCTION public.get_user_tier_level(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_stale_leads() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_expiring_quotes() TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.automation_alerts TO authenticated;
GRANT ALL ON public.automation_alerts TO service_role;
