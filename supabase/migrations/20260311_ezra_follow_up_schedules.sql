-- ============================================================================
-- EZRA FOLLOW-UP SCHEDULES TABLE
-- For storing automated follow-up message sequences
-- ============================================================================

-- Table for scheduled follow-up messages
CREATE TABLE IF NOT EXISTS public.ezra_follow_up_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    sequence_type text NOT NULL, -- 'new_lead', 'quote_viewed', 'application_started', 'no_activity'
    message_id text NOT NULL, -- e.g., 'new_lead_0', 'new_lead_1'
    channel text NOT NULL CHECK (channel IN ('sms', 'email')),
    subject text, -- for email
    message text NOT NULL,
    scheduled_for timestamptz NOT NULL,
    sent_at timestamptz,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(quote_id, message_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_follow_up_schedules_user_id ON public.ezra_follow_up_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_schedules_quote_id ON public.ezra_follow_up_schedules(quote_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_schedules_status ON public.ezra_follow_up_schedules(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_schedules_scheduled_for ON public.ezra_follow_up_schedules(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_follow_up_schedules_pending ON public.ezra_follow_up_schedules(scheduled_for, status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.ezra_follow_up_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_follow_up_schedules' AND policyname = 'efus_own_select') THEN
        CREATE POLICY efus_own_select ON public.ezra_follow_up_schedules FOR SELECT TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_follow_up_schedules' AND policyname = 'efus_own_insert') THEN
        CREATE POLICY efus_own_insert ON public.ezra_follow_up_schedules FOR INSERT TO authenticated
            WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_follow_up_schedules' AND policyname = 'efus_own_update') THEN
        CREATE POLICY efus_own_update ON public.ezra_follow_up_schedules FOR UPDATE TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_follow_up_schedules' AND policyname = 'efus_own_delete') THEN
        CREATE POLICY efus_own_delete ON public.ezra_follow_up_schedules FOR DELETE TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_follow_up_schedules' AND policyname = 'efus_service_all') THEN
        CREATE POLICY efus_service_all ON public.ezra_follow_up_schedules FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Function to get pending follow-ups for a user
CREATE OR REPLACE FUNCTION public.get_pending_follow_ups(p_user_id uuid)
RETURNS TABLE (
    id uuid,
    quote_id uuid,
    sequence_type text,
    message_id text,
    channel text,
    subject text,
    message text,
    scheduled_for timestamptz,
    client_name text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fus.id,
        fus.quote_id,
        fus.sequence_type,
        fus.message_id,
        fus.channel,
        fus.subject,
        fus.message,
        fus.scheduled_for,
        q.quote_data->>'clientName' as client_name
    FROM public.ezra_follow_up_schedules fus
    LEFT JOIN public.quotes q ON q.id = fus.quote_id
    WHERE fus.user_id = p_user_id
    AND fus.status = 'pending'
    AND fus.scheduled_for <= now() + interval '1 hour'
    ORDER BY fus.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark follow-up as sent
CREATE OR REPLACE FUNCTION public.mark_follow_up_sent(p_schedule_id uuid, p_error text DEFAULT null)
RETURNS void AS $$
BEGIN
    UPDATE public.ezra_follow_up_schedules
    SET 
        status = CASE WHEN p_error IS NULL THEN 'sent' ELSE 'failed' END,
        sent_at = CASE WHEN p_error IS NULL THEN now() ELSE null END,
        error_message = p_error,
        updated_at = now()
    WHERE id = p_schedule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_pending_follow_ups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_follow_up_sent(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_follow_ups(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_follow_up_sent(uuid, text) TO service_role;

-- ============================================================================
-- QUOTE VIEWS TRACKING TABLE
-- For analytics on who viewed quotes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quote_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_code text NOT NULL REFERENCES public.quote_links(code) ON DELETE CASCADE,
    lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    viewer_ip text,
    viewer_user_agent text,
    referrer text,
    device_type text, -- 'mobile', 'desktop', 'tablet'
    browser text,
    os text,
    country text,
    city text,
    viewed_at timestamptz DEFAULT now(),
    time_on_page integer, -- in seconds
    sections_viewed text[], -- array of section IDs
    clicked_apply boolean DEFAULT false,
    clicked_schedule boolean DEFAULT false,
    clicked_chat boolean DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quote_views_code ON public.quote_views(quote_code);
CREATE INDEX IF NOT EXISTS idx_quote_views_lead_id ON public.quote_views(lead_id);
CREATE INDEX IF NOT EXISTS idx_quote_views_viewed_at ON public.quote_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_quote_views_code_date ON public.quote_views(quote_code, viewed_at);

-- Enable RLS
ALTER TABLE public.quote_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can see views for their quotes)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quote_views' AND policyname = 'qv_own_select') THEN
        CREATE POLICY qv_own_select ON public.quote_views FOR SELECT TO authenticated
            USING (EXISTS (
                SELECT 1 FROM public.quote_links ql 
                JOIN public.quotes q ON q.id = ql.quote_id
                WHERE ql.code = quote_views.quote_code 
                AND q.user_id = auth.uid()
            ) OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quote_views' AND policyname = 'qv_service_all') THEN
        CREATE POLICY qv_service_all ON public.quote_views FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Function to record a quote view
CREATE OR REPLACE FUNCTION public.record_quote_view(
    p_quote_code text,
    p_lead_id uuid DEFAULT null,
    p_ip text DEFAULT null,
    p_user_agent text DEFAULT null,
    p_referrer text DEFAULT null
)
RETURNS uuid AS $$
DECLARE
    v_view_id uuid;
BEGIN
    INSERT INTO public.quote_views (
        quote_code, lead_id, viewer_ip, viewer_user_agent, referrer
    ) VALUES (
        p_quote_code, p_lead_id, p_ip, p_user_agent, p_referrer
    ) RETURNING id INTO v_view_id;
    
    RETURN v_view_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update view engagement
CREATE OR REPLACE FUNCTION public.update_quote_view_engagement(
    p_view_id uuid,
    p_time_on_page integer,
    p_sections_viewed text[],
    p_clicked_apply boolean,
    p_clicked_schedule boolean,
    p_clicked_chat boolean
)
RETURNS void AS $$
BEGIN
    UPDATE public.quote_views
    SET 
        time_on_page = p_time_on_page,
        sections_viewed = p_sections_viewed,
        clicked_apply = p_clicked_apply,
        clicked_schedule = p_clicked_schedule,
        clicked_chat = p_clicked_chat
    WHERE id = p_view_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.record_quote_view(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_quote_view_engagement(uuid, integer, text[], boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_quote_view(text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_quote_view_engagement(uuid, integer, text[], boolean, boolean, boolean) TO service_role;

-- ============================================================================
-- DONE
-- ============================================================================
