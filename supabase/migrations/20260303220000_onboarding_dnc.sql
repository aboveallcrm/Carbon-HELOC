-- Onboarding + DNC Compliance Migration
-- Adds CRM preference to profiles, DNC columns to leads, and dnc_overrides audit table

-- 1. CRM preference on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS crm_preference text DEFAULT 'none';

-- 2. DNC columns on leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dnc boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dnc_reason text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dnc_updated_at timestamptz;

-- 3. DNC overrides audit log
CREATE TABLE IF NOT EXISTS public.dnc_overrides (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    contact_email text,
    contact_phone text,
    dnc_source text,
    override_reason text NOT NULL,
    action text DEFAULT 'send_override',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dnc_overrides_user_id ON public.dnc_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_dnc_overrides_lead_id ON public.dnc_overrides(lead_id);

ALTER TABLE public.dnc_overrides ENABLE ROW LEVEL SECURITY;

-- Users can manage their own overrides
CREATE POLICY "Users own overrides"
    ON public.dnc_overrides FOR ALL
    USING (user_id = auth.uid());

-- Super Admin full access
CREATE POLICY "Super Admin overrides"
    ON public.dnc_overrides FOR ALL
    USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
