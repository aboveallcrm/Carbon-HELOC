-- ============================================
-- EZRA AI + DEAL RADAR — CLEAN INSTALL
-- ============================================
-- Safe to run multiple times. No is_super_admin() dependency.
-- Run in: Supabase Dashboard > SQL Editor

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- STEP 0: Fix is_super_admin() with explicit casts
-- ============================================
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;

-- ============================================
-- STEP 1: Drop ALL existing policies on all target tables
-- ============================================
DO $$
DECLARE
    _tbl TEXT;
    _pol RECORD;
BEGIN
    FOR _tbl IN SELECT unnest(ARRAY[
        'ezra_conversations','ezra_messages','ezra_knowledge_base',
        'ezra_loan_scenarios','ezra_user_preferences',
        'borrowers','properties','mortgages',
        'deal_radar','deal_radar_scans'
    ]) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=_tbl) THEN
            FOR _pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=_tbl LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _pol.policyname, _tbl);
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- 2. TABLES (all use CREATE TABLE IF NOT EXISTS)
-- ============================================

CREATE TABLE IF NOT EXISTS ezra_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT UNIQUE NOT NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    borrower_name TEXT,
    conversation_summary TEXT,
    quote_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ezra_conv_lo ON ezra_conversations(loan_officer_id);
ALTER TABLE ezra_conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ezra_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ezra_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ezra_msg_conv ON ezra_messages(conversation_id);
ALTER TABLE ezra_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ezra_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_vector vector(1536),
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, title)
);
ALTER TABLE ezra_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ezra_loan_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES ezra_conversations(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    borrower_name TEXT,
    scenario_data JSONB NOT NULL DEFAULT '{}',
    strategy_notes TEXT,
    approval_probability INTEGER,
    is_favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ezra_scen_lo ON ezra_loan_scenarios(loan_officer_id);
ALTER TABLE ezra_loan_scenarios ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ezra_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_model TEXT DEFAULT 'claude',
    quick_commands JSONB DEFAULT '[]',
    auto_fill_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(loan_officer_id)
);
ALTER TABLE ezra_user_preferences ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    credit_score INTEGER,
    annual_income NUMERIC(12,2),
    status TEXT DEFAULT 'active',
    tags TEXT[],
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_borrowers_lo ON borrowers(loan_officer_id);
ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    property_type TEXT,
    estimated_value NUMERIC(12,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_lo ON properties(loan_officer_id);
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS mortgages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    loan_balance NUMERIC(12,2),
    interest_rate NUMERIC(5,3),
    loan_type TEXT,
    lien_position INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mortgages_lo ON mortgages(loan_officer_id);
ALTER TABLE mortgages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS deal_radar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    opportunity_type TEXT NOT NULL,
    tappable_equity NUMERIC(12,2),
    current_combined_ltv NUMERIC(5,2),
    available_heloc_amount NUMERIC(12,2),
    estimated_rate NUMERIC(5,3),
    estimated_savings NUMERIC(10,2),
    suggested_strategy TEXT,
    recommended_product TEXT,
    confidence_score NUMERIC(3,2),
    qualification_status TEXT DEFAULT 'needs_review',
    status TEXT DEFAULT 'new',
    priority_score INTEGER DEFAULT 0,
    ai_analysis TEXT,
    ai_recommendations JSONB,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dr_lo ON deal_radar(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_dr_status ON deal_radar(status);
ALTER TABLE deal_radar ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS deal_radar_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scan_type TEXT NOT NULL DEFAULT 'manual',
    borrowers_scanned INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    total_tappable_equity NUMERIC(15,2),
    scan_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE deal_radar_scans ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. ALL POLICIES via dynamic SQL (avoids type-check errors)
-- ============================================
DO $$
BEGIN
    -- ezra_conversations
    EXECUTE 'CREATE POLICY "ezra_conv_own_select" ON ezra_conversations FOR SELECT USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_conv_own_insert" ON ezra_conversations FOR INSERT WITH CHECK (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_conv_own_update" ON ezra_conversations FOR UPDATE USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_conv_own_delete" ON ezra_conversations FOR DELETE USING (auth.uid() = loan_officer_id)';

    -- ezra_messages
    EXECUTE 'CREATE POLICY "ezra_msg_own_select" ON ezra_messages FOR SELECT USING (EXISTS (SELECT 1 FROM ezra_conversations ec WHERE ec.id = ezra_messages.conversation_id AND ec.loan_officer_id = auth.uid()))';
    EXECUTE 'CREATE POLICY "ezra_msg_own_insert" ON ezra_messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM ezra_conversations ec WHERE ec.id = ezra_messages.conversation_id AND ec.loan_officer_id = auth.uid()))';

    -- ezra_knowledge_base (public read)
    EXECUTE 'CREATE POLICY "ezra_kb_public_read" ON ezra_knowledge_base FOR SELECT USING (is_active = true)';

    -- ezra_loan_scenarios
    EXECUTE 'CREATE POLICY "ezra_scen_own_select" ON ezra_loan_scenarios FOR SELECT USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_scen_own_insert" ON ezra_loan_scenarios FOR INSERT WITH CHECK (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_scen_own_update" ON ezra_loan_scenarios FOR UPDATE USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_scen_own_delete" ON ezra_loan_scenarios FOR DELETE USING (auth.uid() = loan_officer_id)';

    -- ezra_user_preferences
    EXECUTE 'CREATE POLICY "ezra_pref_own_select" ON ezra_user_preferences FOR SELECT USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_pref_own_insert" ON ezra_user_preferences FOR INSERT WITH CHECK (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "ezra_pref_own_update" ON ezra_user_preferences FOR UPDATE USING (auth.uid() = loan_officer_id)';

    -- borrowers
    EXECUTE 'CREATE POLICY "borrowers_own_select" ON borrowers FOR SELECT USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "borrowers_own_insert" ON borrowers FOR INSERT WITH CHECK (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "borrowers_own_update" ON borrowers FOR UPDATE USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "borrowers_own_delete" ON borrowers FOR DELETE USING (auth.uid() = loan_officer_id)';

    -- properties
    EXECUTE 'CREATE POLICY "properties_own_select" ON properties FOR SELECT USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "properties_own_insert" ON properties FOR INSERT WITH CHECK (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "properties_own_update" ON properties FOR UPDATE USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "properties_own_delete" ON properties FOR DELETE USING (auth.uid() = loan_officer_id)';

    -- mortgages
    EXECUTE 'CREATE POLICY "mortgages_own_select" ON mortgages FOR SELECT USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "mortgages_own_insert" ON mortgages FOR INSERT WITH CHECK (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "mortgages_own_update" ON mortgages FOR UPDATE USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "mortgages_own_delete" ON mortgages FOR DELETE USING (auth.uid() = loan_officer_id)';

    -- deal_radar
    EXECUTE 'CREATE POLICY "deal_radar_own_select" ON deal_radar FOR SELECT USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "deal_radar_own_insert" ON deal_radar FOR INSERT WITH CHECK (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "deal_radar_own_update" ON deal_radar FOR UPDATE USING (auth.uid() = loan_officer_id)';
    EXECUTE 'CREATE POLICY "deal_radar_own_delete" ON deal_radar FOR DELETE USING (auth.uid() = loan_officer_id)';

    -- deal_radar_scans
    EXECUTE 'CREATE POLICY "dr_scans_own_select" ON deal_radar_scans FOR SELECT USING (auth.uid() = loan_officer_id)';

    -- Super admin policies
    EXECUTE 'CREATE POLICY "ezra_conv_sa_all" ON ezra_conversations FOR ALL USING (is_super_admin())';
    EXECUTE 'CREATE POLICY "ezra_msg_sa_all" ON ezra_messages FOR ALL USING (is_super_admin())';
    EXECUTE 'CREATE POLICY "ezra_kb_sa_all" ON ezra_knowledge_base FOR ALL USING (is_super_admin())';
    EXECUTE 'CREATE POLICY "borrowers_sa_all" ON borrowers FOR ALL USING (is_super_admin())';
END $$;

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION calculate_tappable_equity(
    p_property_value NUMERIC, p_total_liens NUMERIC, p_max_ltv NUMERIC DEFAULT 85.0
) RETURNS NUMERIC AS $$
BEGIN RETURN GREATEST(0, (p_property_value * (p_max_ltv / 100)) - p_total_liens); END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION calculate_cltv(
    p_property_value NUMERIC, p_total_liens NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
    IF p_property_value IS NULL OR p_property_value = 0 THEN RETURN NULL; END IF;
    RETURN ROUND((p_total_liens / p_property_value) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION search_ezra_knowledge(
    query_embedding vector(1536), match_threshold FLOAT, match_count INT
) RETURNS TABLE (id UUID, category TEXT, title TEXT, content TEXT, similarity FLOAT) AS $$
BEGIN
    RETURN QUERY
    SELECT kb.id, kb.category, kb.title, kb.content,
        1 - (kb.content_vector <=> query_embedding) AS similarity
    FROM ezra_knowledge_base kb
    WHERE kb.is_active = true AND 1 - (kb.content_vector <=> query_embedding) > match_threshold
    ORDER BY kb.content_vector <=> query_embedding LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_conversation_history(
    p_conversation_id UUID, p_limit INT DEFAULT 50
) RETURNS TABLE (role TEXT, content TEXT, model_used TEXT, created_at TIMESTAMP WITH TIME ZONE) AS $$
BEGIN
    RETURN QUERY SELECT m.role, m.content, m.model_used, m.created_at
    FROM ezra_messages m WHERE m.conversation_id::text = p_conversation_id::text
    ORDER BY m.created_at ASC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_deal_radar_dashboard(p_loan_officer_id UUID) RETURNS JSONB AS $$
DECLARE v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_opportunities', COUNT(*),
        'total_tappable_equity', COALESCE(SUM(tappable_equity), 0)
    ) INTO v_result
    FROM deal_radar WHERE loan_officer_id = p_loan_officer_id AND status = 'new' AND expires_at > NOW();
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. UPDATE TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_ezra_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$
DECLARE _tbl TEXT;
BEGIN
    FOR _tbl IN SELECT unnest(ARRAY[
        'ezra_conversations','ezra_knowledge_base','ezra_loan_scenarios',
        'ezra_user_preferences','borrowers','properties','mortgages','deal_radar'
    ]) LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', _tbl, _tbl);
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=_tbl AND column_name='updated_at') THEN
            EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_ezra_updated_at()', _tbl, _tbl);
        END IF;
    END LOOP;
END $$;

-- ============================================
-- 6. SEED KNOWLEDGE BASE
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
('sales_scripts', 'HELOC Value Proposition', 'A HELOC gives homeowners financial flexibility. Think of it as a safety net that turns your home equity into accessible cash.', true),
('objections', 'Rate Concern Response', 'I understand rate is important. With a HELOC, you have flexibility - you can lock in portions at fixed rates when rates are favorable.', true),
('heloc_guidelines', 'CLTV Calculation', 'Combined Loan-to-Value (CLTV) = (First Mortgage Balance + HELOC Amount) / Property Value. Most HELOC programs allow up to 85% CLTV.', true)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- DONE
SELECT 'Ezra AI + Deal Radar installed successfully' AS result;
