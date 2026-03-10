-- ============================================================================
-- COMPREHENSIVE FIX MIGRATION
-- Addresses all missing foundation tables, functions, columns, RLS policies,
-- and GRANTs identified during the full SQL audit.
-- Safe to run on existing DB (all statements use IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ============================================================================
-- SECTION 1: is_super_admin() function (used by RLS policies everywhere)
-- MUST be SECURITY DEFINER so it bypasses RLS when checking auth.uid()
-- NEVER call this from profiles RLS policies (causes infinite recursion)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- SECTION 2: Foundation table — profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    role text DEFAULT 'user',
    tier text DEFAULT 'carbon',
    subscription_status text DEFAULT 'trialing',
    onboarding_completed boolean DEFAULT false,
    onboarding_step integer DEFAULT 0,
    onboarding_data jsonb DEFAULT '{}',
    crm_preference text DEFAULT 'none',
    lead_notifications_email boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Add columns that may be missing if table already existed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tier text DEFAULT 'carbon';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trialing';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_data jsonb DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crm_preference text DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lead_notifications_email boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- profiles RLS: uses HARDCODED UUID (never is_super_admin() — would cause recursion)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_own_select') THEN
        CREATE POLICY profiles_own_select ON public.profiles FOR SELECT TO authenticated
            USING (id = auth.uid() OR auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_own_update') THEN
        CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE TO authenticated
            USING (id = auth.uid() OR auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_own_insert') THEN
        CREATE POLICY profiles_own_insert ON public.profiles FOR INSERT TO authenticated
            WITH CHECK (id = auth.uid() OR auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_sa_delete') THEN
        CREATE POLICY profiles_sa_delete ON public.profiles FOR DELETE TO authenticated
            USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
    END IF;
END $$;

-- Service role needs access for edge functions (bonzo-webhook, etc.)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_service_all') THEN
        CREATE POLICY profiles_service_all ON public.profiles FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- ============================================================================
-- SECTION 3: Foundation table — leads
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    first_name text,
    last_name text,
    email text,
    phone text,
    source text,
    crm_source text DEFAULT 'webhook',
    crm_contact_id text,
    status text DEFAULT 'new',
    stage text DEFAULT 'new',
    metadata jsonb DEFAULT '{}',
    dnc boolean DEFAULT false,
    dnc_reason text,
    dnc_updated_at timestamptz,
    engagement_score integer DEFAULT 0,
    engagement_updated_at timestamptz,
    last_click_at timestamptz,
    quote_url text,
    quote_sent_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Add columns that may be missing if table already existed
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_source text DEFAULT 'webhook';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_contact_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage text DEFAULT 'new';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dnc boolean DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dnc_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dnc_updated_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS engagement_score integer DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS engagement_updated_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_click_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS quote_url text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_own_select') THEN
        CREATE POLICY leads_own_select ON public.leads FOR SELECT TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_own_insert') THEN
        CREATE POLICY leads_own_insert ON public.leads FOR INSERT TO authenticated
            WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_own_update') THEN
        CREATE POLICY leads_own_update ON public.leads FOR UPDATE TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_own_delete') THEN
        CREATE POLICY leads_own_delete ON public.leads FOR DELETE TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_service_all') THEN
        CREATE POLICY leads_service_all ON public.leads FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- ============================================================================
-- SECTION 4: Foundation table — user_integrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_integrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    api_key text,
    webhook_url text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz,
    UNIQUE(user_id, provider)
);

-- Add columns that may be missing if table already existed
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS api_key text;
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS webhook_url text;
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_integrations' AND policyname = 'ui_own_select') THEN
        CREATE POLICY ui_own_select ON public.user_integrations FOR SELECT TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_integrations' AND policyname = 'ui_own_insert') THEN
        CREATE POLICY ui_own_insert ON public.user_integrations FOR INSERT TO authenticated
            WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_integrations' AND policyname = 'ui_own_update') THEN
        CREATE POLICY ui_own_update ON public.user_integrations FOR UPDATE TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_integrations' AND policyname = 'ui_own_delete') THEN
        CREATE POLICY ui_own_delete ON public.user_integrations FOR DELETE TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_integrations' AND policyname = 'ui_service_all') THEN
        CREATE POLICY ui_service_all ON public.user_integrations FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- ============================================================================
-- SECTION 5: Foundation table — consent_vault
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.consent_vault (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    lead_id uuid,
    phone text,
    email text,
    consent_type text,
    consent_source text,
    consent_text text,
    opted_in_at timestamptz,
    revoked_at timestamptz,
    revoke_method text,
    is_active boolean,
    channels_allowed jsonb,
    dnc_listed boolean,
    dnc_listed_at timestamptz,
    timezone text,
    tcpa_compliant_hours text,
    ip_address text,
    metadata jsonb DEFAULT '{}',
    provider text,
    opted_out boolean,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add columns that may be missing if table already existed
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS lead_id uuid;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS consent_type text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS consent_source text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS consent_text text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS opted_in_at timestamptz;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS revoke_method text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS is_active boolean;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS channels_allowed jsonb;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS dnc_listed boolean;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS dnc_listed_at timestamptz;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS tcpa_compliant_hours text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS opted_out boolean;
ALTER TABLE public.consent_vault ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.consent_vault ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consent_vault' AND policyname = 'cv_own_select') THEN
        CREATE POLICY cv_own_select ON public.consent_vault FOR SELECT TO authenticated
            USING (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consent_vault' AND policyname = 'cv_own_insert') THEN
        CREATE POLICY cv_own_insert ON public.consent_vault FOR INSERT TO authenticated
            WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consent_vault' AND policyname = 'cv_service_all') THEN
        CREATE POLICY cv_service_all ON public.consent_vault FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- ============================================================================
-- SECTION 6: Missing columns on existing tables
-- ============================================================================

-- 6a. clicks table — ip_address column (redirect edge function writes it)
ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS ip_address text;

-- 6b. ezra_knowledge_base — is_system column (referenced in cleanup migration)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ezra_knowledge_base' AND table_schema = 'public') THEN
        ALTER TABLE public.ezra_knowledge_base ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;
    END IF;
END $$;

-- ============================================================================
-- SECTION 7: Fix lead_analytics.user_id — make nullable
-- get-prompt edge function inserts with user_id = null for anonymous prompt usage
-- ============================================================================
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lead_analytics' AND column_name = 'user_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.lead_analytics ALTER COLUMN user_id DROP NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- SECTION 8: Missing RLS policies on Ezra tables
-- ============================================================================

-- 8a. ezra_knowledge_base — SA full access
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ezra_knowledge_base') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_knowledge_base' AND policyname = 'ekb_sa_all') THEN
            CREATE POLICY ekb_sa_all ON public.ezra_knowledge_base FOR ALL TO authenticated
                USING (public.is_super_admin());
        END IF;
    END IF;
END $$;

-- 8b. borrowers — UPDATE and DELETE for owners + SA
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'borrowers') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'borrowers' AND policyname = 'borrowers_own_update') THEN
            CREATE POLICY borrowers_own_update ON public.borrowers FOR UPDATE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'borrowers' AND policyname = 'borrowers_own_delete') THEN
            CREATE POLICY borrowers_own_delete ON public.borrowers FOR DELETE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
    END IF;
END $$;

-- 8c. properties — INSERT, UPDATE, DELETE for owners + SA
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'properties') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'properties_own_insert') THEN
            CREATE POLICY properties_own_insert ON public.properties FOR INSERT TO authenticated
                WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'properties_own_update') THEN
            CREATE POLICY properties_own_update ON public.properties FOR UPDATE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'properties_own_delete') THEN
            CREATE POLICY properties_own_delete ON public.properties FOR DELETE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
    END IF;
END $$;

-- 8d. mortgages — INSERT, UPDATE, DELETE for owners + SA
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mortgages') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mortgages' AND policyname = 'mortgages_own_insert') THEN
            CREATE POLICY mortgages_own_insert ON public.mortgages FOR INSERT TO authenticated
                WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mortgages' AND policyname = 'mortgages_own_update') THEN
            CREATE POLICY mortgages_own_update ON public.mortgages FOR UPDATE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mortgages' AND policyname = 'mortgages_own_delete') THEN
            CREATE POLICY mortgages_own_delete ON public.mortgages FOR DELETE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
    END IF;
END $$;

-- 8e. deal_radar — UPDATE and DELETE for owners + SA
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deal_radar') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deal_radar' AND policyname = 'deal_radar_own_update') THEN
            CREATE POLICY deal_radar_own_update ON public.deal_radar FOR UPDATE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deal_radar' AND policyname = 'deal_radar_own_delete') THEN
            CREATE POLICY deal_radar_own_delete ON public.deal_radar FOR DELETE TO authenticated
                USING (user_id = auth.uid() OR public.is_super_admin());
        END IF;
    END IF;
END $$;

-- 8f. market_rates — enable RLS + public read
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'market_rates') THEN
        ALTER TABLE public.market_rates ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'market_rates' AND policyname = 'market_rates_public_read') THEN
            CREATE POLICY market_rates_public_read ON public.market_rates FOR SELECT TO authenticated USING (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'market_rates' AND policyname = 'market_rates_sa_all') THEN
            CREATE POLICY market_rates_sa_all ON public.market_rates FOR ALL TO authenticated
                USING (public.is_super_admin());
        END IF;
    END IF;
END $$;

-- 8g. ezra_conversations — SA full access
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ezra_conversations') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_conversations' AND policyname = 'ec_sa_all') THEN
            CREATE POLICY ec_sa_all ON public.ezra_conversations FOR ALL TO authenticated
                USING (public.is_super_admin());
        END IF;
    END IF;
END $$;

-- 8h. ezra_messages — SA full access + authenticated INSERT (for Ezra JS direct inserts)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ezra_messages') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ezra_messages' AND policyname = 'em_sa_all') THEN
            CREATE POLICY em_sa_all ON public.ezra_messages FOR ALL TO authenticated
                USING (public.is_super_admin());
        END IF;
    END IF;
END $$;

-- ============================================================================
-- SECTION 9: Missing GRANT statements for Ezra RPC functions
-- ============================================================================
-- Grant with explicit argument lists to avoid ambiguity from overloaded functions
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_ezra_knowledge') THEN
        GRANT EXECUTE ON FUNCTION public.search_ezra_knowledge(vector, FLOAT, INT, TEXT) TO authenticated;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calculate_tappable_equity') THEN
        GRANT EXECUTE ON FUNCTION public.calculate_tappable_equity(NUMERIC, NUMERIC, NUMERIC) TO authenticated;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calculate_cltv') THEN
        GRANT EXECUTE ON FUNCTION public.calculate_cltv(NUMERIC, NUMERIC) TO authenticated;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- SECTION 10: Auto-create profile on user signup (trigger)
-- Ensures profiles row always exists when a user registers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role, tier, subscription_status)
    VALUES (NEW.id, NEW.email, 'user', 'carbon', 'trialing')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
    ) THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

-- ============================================================================
-- DONE. Run this in Supabase Dashboard SQL Editor.
-- All statements are idempotent (IF NOT EXISTS / OR REPLACE).
-- ============================================================================
