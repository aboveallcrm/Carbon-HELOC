-- Lead Analytics table — tracks quote opens, section views, button clicks, time on page
-- Populated by the track-quote-view Edge Function (service role — bypasses RLS)

CREATE TABLE IF NOT EXISTS public.lead_analytics (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    event_type text NOT NULL,       -- 'quote_opened', 'section_viewed', 'button_clicked', 'time_on_page'
    event_data jsonb DEFAULT '{}',  -- { section, duration_sec, device, button_name, ... }
    ip_address text,                -- Last octet masked for privacy (e.g., 192.168.1.xxx)
    user_agent text,
    created_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_analytics_lead_id ON public.lead_analytics(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_analytics_user_id ON public.lead_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_analytics_event_type ON public.lead_analytics(event_type);

-- Enable RLS
ALTER TABLE public.lead_analytics ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own lead analytics" ON public.lead_analytics;
DROP POLICY IF EXISTS "Super Admin can view all analytics" ON public.lead_analytics;

-- LOs can read analytics for their own leads
CREATE POLICY "Users can view own lead analytics"
    ON public.lead_analytics FOR SELECT
    USING (auth.uid() = user_id);

-- Super Admin can view all analytics
CREATE POLICY "Super Admin can view all analytics"
    ON public.lead_analytics FOR SELECT
    USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- No INSERT/UPDATE/DELETE policies for regular users
-- Only the Edge Function (using service_role key) can write analytics
-- This prevents clients from spoofing analytics data

-- Also add a Super Admin DELETE policy on leads table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'leads' AND policyname = 'Super Admin can delete all leads'
    ) THEN
        CREATE POLICY "Super Admin can delete all leads"
            ON public.leads FOR DELETE
            USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
    END IF;
END $$;
