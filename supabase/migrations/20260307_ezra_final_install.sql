-- EZRA AI ULTIMATE - Final Installation
-- Run this single migration to set up all Ezra tables

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. EZRA CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT UNIQUE NOT NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    borrower_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    borrower_name TEXT,
    conversation_summary TEXT,
    quote_data JSONB DEFAULT '{}',
    tier_access TEXT DEFAULT 'diamond',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ezra_conv_loan_officer ON ezra_conversations(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_ezra_conv_status ON ezra_conversations(status);

ALTER TABLE ezra_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ezra_conv_select ON ezra_conversations;
DROP POLICY IF EXISTS ezra_conv_insert ON ezra_conversations;
DROP POLICY IF EXISTS ezra_conv_update ON ezra_conversations;

CREATE POLICY ezra_conv_select ON ezra_conversations FOR SELECT USING (loan_officer_id = auth.uid());
CREATE POLICY ezra_conv_insert ON ezra_conversations FOR INSERT WITH CHECK (loan_officer_id = auth.uid());
CREATE POLICY ezra_conv_update ON ezra_conversations FOR UPDATE USING (loan_officer_id = auth.uid());

-- ============================================
-- 2. EZRA MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ezra_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ezra_msg_conversation ON ezra_messages(conversation_id);

ALTER TABLE ezra_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ezra_msg_select ON ezra_messages;
CREATE POLICY ezra_msg_select ON ezra_messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM ezra_conversations ec WHERE ec.id = ezra_messages.conversation_id AND ec.loan_officer_id = auth.uid())
);

-- ============================================
-- 3. EZRA KNOWLEDGE BASE
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_vector vector(1536),
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ezra_kb_category ON ezra_knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_ezra_kb_vector ON ezra_knowledge_base USING ivfflat (content_vector vector_cosine_ops);

ALTER TABLE ezra_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ezra_kb_select ON ezra_knowledge_base;
CREATE POLICY ezra_kb_select ON ezra_knowledge_base FOR SELECT USING (is_active = true);

-- ============================================
-- 4. BORROWERS (for Deal Radar)
-- ============================================
CREATE TABLE IF NOT EXISTS borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    credit_score INTEGER,
    annual_income NUMERIC(12,2),
    debt_to_income_ratio NUMERIC(5,2),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_borrowers_loan_officer ON borrowers(loan_officer_id);

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS borrowers_select ON borrowers;
DROP POLICY IF EXISTS borrowers_insert ON borrowers;
CREATE POLICY borrowers_select ON borrowers FOR SELECT USING (loan_officer_id = auth.uid());
CREATE POLICY borrowers_insert ON borrowers FOR INSERT WITH CHECK (loan_officer_id = auth.uid());

-- ============================================
-- 5. PROPERTIES
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    property_type TEXT,
    occupancy_type TEXT,
    estimated_value NUMERIC(12,2),
    is_primary_residence BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_borrower ON properties(borrower_id);
CREATE INDEX IF NOT EXISTS idx_properties_loan_officer ON properties(loan_officer_id);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select ON properties;
CREATE POLICY properties_select ON properties FOR SELECT USING (loan_officer_id = auth.uid());

-- ============================================
-- 6. MORTGAGES
-- ============================================
CREATE TABLE IF NOT EXISTS mortgages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lender_name TEXT,
    loan_type TEXT,
    loan_balance NUMERIC(12,2),
    interest_rate NUMERIC(5,3),
    loan_term_years INTEGER,
    monthly_payment NUMERIC(10,2),
    lien_position INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mortgages_borrower ON mortgages(borrower_id);
CREATE INDEX IF NOT EXISTS idx_mortgages_loan_officer ON mortgages(loan_officer_id);

ALTER TABLE mortgages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mortgages_select ON mortgages;
CREATE POLICY mortgages_select ON mortgages FOR SELECT USING (loan_officer_id = auth.uid());

-- ============================================
-- 7. DEAL RADAR
-- ============================================
CREATE TABLE IF NOT EXISTS deal_radar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    opportunity_type TEXT NOT NULL,
    estimated_equity NUMERIC(12,2),
    tappable_equity NUMERIC(12,2),
    current_combined_ltv NUMERIC(5,2),
    max_allowed_ltv NUMERIC(5,2) DEFAULT 85.00,
    available_heloc_amount NUMERIC(12,2),
    estimated_rate NUMERIC(5,3),
    estimated_monthly_payment NUMERIC(10,2),
    suggested_strategy TEXT,
    recommended_product TEXT,
    optimal_loan_amount NUMERIC(12,2),
    confidence_score NUMERIC(3,2),
    qualification_status TEXT,
    status TEXT DEFAULT 'new',
    priority_score INTEGER,
    ai_analysis TEXT,
    ai_recommendations JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_radar_loan_officer ON deal_radar(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_deal_radar_status ON deal_radar(status);
CREATE INDEX IF NOT EXISTS idx_deal_radar_priority ON deal_radar(priority_score DESC);

ALTER TABLE deal_radar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_radar_select ON deal_radar;
DROP POLICY IF EXISTS deal_radar_insert ON deal_radar;
CREATE POLICY deal_radar_select ON deal_radar FOR SELECT USING (loan_officer_id = auth.uid());
CREATE POLICY deal_radar_insert ON deal_radar FOR INSERT WITH CHECK (loan_officer_id = auth.uid());

-- ============================================
-- 8. DEAL RADAR SCANS
-- ============================================
CREATE TABLE IF NOT EXISTS deal_radar_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scan_type TEXT NOT NULL,
    borrowers_scanned INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    opportunities_by_type JSONB DEFAULT '{}',
    total_tappable_equity NUMERIC(15,2),
    scan_duration_ms INTEGER,
    triggered_by TEXT DEFAULT 'scheduled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE deal_radar_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_radar_scans_select ON deal_radar_scans;
CREATE POLICY deal_radar_scans_select ON deal_radar_scans FOR SELECT USING (loan_officer_id = auth.uid());

-- ============================================
-- 9. EZRA USER PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_model TEXT DEFAULT 'claude',
    quick_commands JSONB DEFAULT '["Create Quote", "Structure Deal", "Handle Objection", "Explain Strategy", "Generate Client Script"]',
    default_tier TEXT DEFAULT 'diamond',
    auto_fill_enabled BOOLEAN DEFAULT true,
    sales_coach_enabled BOOLEAN DEFAULT true,
    voice_control_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(loan_officer_id)
);

ALTER TABLE ezra_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ezra_prefs_select ON ezra_user_preferences;
DROP POLICY IF EXISTS ezra_prefs_insert ON ezra_user_preferences;
DROP POLICY IF EXISTS ezra_prefs_update ON ezra_user_preferences;

CREATE POLICY ezra_prefs_select ON ezra_user_preferences FOR SELECT USING (loan_officer_id = auth.uid());
CREATE POLICY ezra_prefs_insert ON ezra_user_preferences FOR INSERT WITH CHECK (loan_officer_id = auth.uid());
CREATE POLICY ezra_prefs_update ON ezra_user_preferences FOR UPDATE USING (loan_officer_id = auth.uid());

-- ============================================
-- 10. MARKET RATES (for Rate Defense)
-- ============================================
CREATE TABLE IF NOT EXISTS market_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    avg_rate NUMERIC(5,3),
    rates JSONB DEFAULT '{}',
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_rates_date ON market_rates(date DESC);

-- ============================================
-- 11. EZRA SCHEDULED ACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_scheduled_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ezra_actions_loan_officer ON ezra_scheduled_actions(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_ezra_actions_status ON ezra_scheduled_actions(status);

ALTER TABLE ezra_scheduled_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ezra_actions_select ON ezra_scheduled_actions;
CREATE POLICY ezra_actions_select ON ezra_scheduled_actions FOR SELECT USING (loan_officer_id = auth.uid());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION calculate_tappable_equity(
    p_property_value NUMERIC,
    p_total_liens NUMERIC,
    p_max_ltv NUMERIC DEFAULT 85.0
)
RETURNS NUMERIC AS $$
BEGIN
    RETURN GREATEST(0, (p_property_value * (p_max_ltv / 100)) - p_total_liens);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION calculate_cltv(
    p_property_value NUMERIC,
    p_total_liens NUMERIC
)
RETURNS NUMERIC AS $$
BEGIN
    IF p_property_value = 0 OR p_property_value IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN ROUND((p_total_liens / p_property_value) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION search_ezra_knowledge(
    query_embedding vector(1536),
    match_threshold FLOAT,
    match_count INT,
    filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    category TEXT,
    title TEXT,
    content TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kb.id,
        kb.category,
        kb.title,
        kb.content,
        1 - (kb.content_vector <=> query_embedding) AS similarity
    FROM ezra_knowledge_base kb
    WHERE kb.is_active = true
    AND (filter_category IS NULL OR kb.category = filter_category)
    AND 1 - (kb.content_vector <=> query_embedding) > match_threshold
    ORDER BY kb.content_vector <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, metadata) VALUES
('sales_scripts', 'HELOC Value Proposition', 'A HELOC gives homeowners financial flexibility. Think of it as a safety net that turns your home equity into accessible cash. You only pay interest on what you use, not the full credit line.', '{"tags": ["value_prop", "introduction"], "source": "sales_training"}'),
('objections', 'Rate Concern Response', 'I understand rate is important. With a HELOC, you have flexibility - you can lock in portions at fixed rates when rates are favorable, while keeping the rest as a low-cost safety net.', '{"tags": ["rate", "objection"], "source": "sales_training"}'),
('heloc_guidelines', 'CLTV Calculation', 'Combined Loan-to-Value (CLTV) = (First Mortgage Balance + HELOC Amount) / Property Value. Most HELOC programs allow up to 85% CLTV for primary residences.', '{"tags": ["cltv", "calculation", "guidelines"], "source": "underwriting"}'),
('loan_programs', 'Fixed Rate HELOC', 'Fixed Rate HELOC allows borrowers to lock portions of their credit line at a fixed rate. Provides payment stability while maintaining access to equity.', '{"tags": ["fixed_rate", "product"], "source": "product_guide"}')
ON CONFLICT DO NOTHING;

-- Insert sample market rate
INSERT INTO market_rates (date, avg_rate, rates) 
SELECT CURRENT_DATE, 8.25, '{"rocket": 8.5, "bofa": 8.75, "wells": 8.625, "chase": 8.375}'
WHERE NOT EXISTS (SELECT 1 FROM market_rates WHERE date = CURRENT_DATE);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_ezra_conversations_updated_at ON ezra_conversations;
DROP TRIGGER IF EXISTS update_ezra_knowledge_base_updated_at ON ezra_knowledge_base;
DROP TRIGGER IF EXISTS update_borrowers_updated_at ON borrowers;
DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
DROP TRIGGER IF EXISTS update_mortgages_updated_at ON mortgages;
DROP TRIGGER IF EXISTS update_deal_radar_updated_at ON deal_radar;
DROP TRIGGER IF EXISTS update_ezra_user_prefs_updated_at ON ezra_user_preferences;

-- Create triggers
CREATE TRIGGER update_ezra_conversations_updated_at BEFORE UPDATE ON ezra_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ezra_knowledge_base_updated_at BEFORE UPDATE ON ezra_knowledge_base FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_borrowers_updated_at BEFORE UPDATE ON borrowers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mortgages_updated_at BEFORE UPDATE ON mortgages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deal_radar_updated_at BEFORE UPDATE ON deal_radar FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ezra_user_prefs_updated_at BEFORE UPDATE ON ezra_user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
