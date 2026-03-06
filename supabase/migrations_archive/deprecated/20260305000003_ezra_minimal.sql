-- Minimal Ezra + Deal Radar Setup
-- Run this first to get basic tables working

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- EZRA CONVERSATIONS (Minimal)
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT UNIQUE NOT NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    borrower_name TEXT,
    conversation_summary TEXT,
    quote_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ezra_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ezra_conv_select" ON ezra_conversations;
DROP POLICY IF EXISTS "ezra_conv_insert" ON ezra_conversations;

CREATE POLICY "ezra_conv_select" ON ezra_conversations FOR SELECT USING (auth.uid() = loan_officer_id);
CREATE POLICY "ezra_conv_insert" ON ezra_conversations FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);

-- ============================================
-- EZRA MESSAGES (Minimal)
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ezra_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ezra_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ezra_msg_select" ON ezra_messages;
CREATE POLICY "ezra_msg_select" ON ezra_messages FOR SELECT 
    USING (EXISTS (SELECT 1 FROM ezra_conversations ec WHERE ec.id = conversation_id AND ec.loan_officer_id = auth.uid()));

-- ============================================
-- EZRA KNOWLEDGE BASE (Minimal)
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_vector vector(1536),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ezra_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ezra_kb_select" ON ezra_knowledge_base;
CREATE POLICY "ezra_kb_select" ON ezra_knowledge_base FOR SELECT USING (is_active = true);

-- ============================================
-- BORROWERS (Minimal)
-- ============================================
CREATE TABLE IF NOT EXISTS borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    credit_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "borrowers_select" ON borrowers;
DROP POLICY IF EXISTS "borrowers_insert" ON borrowers;

CREATE POLICY "borrowers_select" ON borrowers FOR SELECT USING (auth.uid() = loan_officer_id);
CREATE POLICY "borrowers_insert" ON borrowers FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);

-- ============================================
-- PROPERTIES (Minimal)
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    estimated_value NUMERIC(12,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select" ON properties;
CREATE POLICY "properties_select" ON properties FOR SELECT USING (auth.uid() = loan_officer_id);

-- ============================================
-- MORTGAGES (Minimal)
-- ============================================
CREATE TABLE IF NOT EXISTS mortgages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    loan_balance NUMERIC(12,2),
    interest_rate NUMERIC(5,3),
    lien_position INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE mortgages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mortgages_select" ON mortgages;
CREATE POLICY "mortgages_select" ON mortgages FOR SELECT USING (auth.uid() = loan_officer_id);

-- ============================================
-- DEAL RADAR (Minimal)
-- ============================================
CREATE TABLE IF NOT EXISTS deal_radar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    opportunity_type TEXT NOT NULL,
    tappable_equity NUMERIC(12,2),
    current_combined_ltv NUMERIC(5,2),
    estimated_rate NUMERIC(5,3),
    suggested_strategy TEXT,
    confidence_score NUMERIC(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE deal_radar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_radar_select" ON deal_radar;
CREATE POLICY "deal_radar_select" ON deal_radar FOR SELECT USING (auth.uid() = loan_officer_id);

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

CREATE OR REPLACE FUNCTION search_ezra_knowledge(
    query_embedding vector(1536),
    match_threshold FLOAT,
    match_count INT
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
    AND 1 - (kb.content_vector <=> query_embedding) > match_threshold
    ORDER BY kb.content_vector <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content) VALUES
('sales_scripts', 'HELOC Value Proposition', 'A HELOC gives homeowners financial flexibility. Think of it as a safety net that turns your home equity into accessible cash.'),
('objections', 'Rate Concern Response', 'I understand rate is important. With a HELOC, you have flexibility - you can lock in portions at fixed rates when rates are favorable.'),
('heloc_guidelines', 'CLTV Calculation', 'Combined Loan-to-Value (CLTV) = (First Mortgage Balance + HELOC Amount) / Property Value. Most HELOC programs allow up to 85% CLTV.')
ON CONFLICT DO NOTHING;
