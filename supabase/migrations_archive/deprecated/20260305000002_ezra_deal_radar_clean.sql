-- Migration: Ezra + Deal Radar (Clean Install)
-- Created: 2026-03-05
-- Run this if the previous migrations failed

-- ============================================
-- 1. ENABLE PGVECTOR (if not already enabled)
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 2. EZRA CONVERSATIONS
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

DROP POLICY IF EXISTS "Users can view own ezra conversations" ON ezra_conversations;
DROP POLICY IF EXISTS "Users can insert own ezra conversations" ON ezra_conversations;
DROP POLICY IF EXISTS "Users can update own ezra conversations" ON ezra_conversations;

CREATE POLICY "Users can view own ezra conversations" ON ezra_conversations FOR SELECT USING (auth.uid() = loan_officer_id);
CREATE POLICY "Users can insert own ezra conversations" ON ezra_conversations FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);
CREATE POLICY "Users can update own ezra conversations" ON ezra_conversations FOR UPDATE USING (auth.uid() = loan_officer_id);

-- ============================================
-- 3. EZRA MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ezra_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model_used TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ezra_msg_conversation ON ezra_messages(conversation_id);

ALTER TABLE ezra_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages from own conversations" ON ezra_messages;
DROP POLICY IF EXISTS "Users can insert messages to own conversations" ON ezra_messages;

CREATE POLICY "Users can view messages from own conversations" ON ezra_messages FOR SELECT 
    USING (EXISTS (SELECT 1 FROM ezra_conversations WHERE ezra_conversations.id = ezra_messages.conversation_id AND ezra_conversations.loan_officer_id = auth.uid()));

CREATE POLICY "Users can insert messages to own conversations" ON ezra_messages FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM ezra_conversations WHERE ezra_conversations.id = ezra_messages.conversation_id AND ezra_conversations.loan_officer_id = auth.uid()));

-- ============================================
-- 4. EZRA KNOWLEDGE BASE
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

DROP POLICY IF EXISTS "Anyone can view active knowledge base" ON ezra_knowledge_base;
CREATE POLICY "Anyone can view active knowledge base" ON ezra_knowledge_base FOR SELECT USING (is_active = true);

-- ============================================
-- 5. DEAL RADAR TABLES
-- ============================================

-- Borrowers
CREATE TABLE IF NOT EXISTS borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    credit_score INTEGER CHECK (credit_score >= 300 AND credit_score <= 850),
    annual_income NUMERIC(12,2),
    debt_to_income_ratio NUMERIC(5,2),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_borrowers_loan_officer ON borrowers(loan_officer_id);

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own borrowers" ON borrowers;
DROP POLICY IF EXISTS "Users can insert own borrowers" ON borrowers;
DROP POLICY IF EXISTS "Users can update own borrowers" ON borrowers;

CREATE POLICY "Users can view own borrowers" ON borrowers FOR SELECT USING (auth.uid() = loan_officer_id);
CREATE POLICY "Users can insert own borrowers" ON borrowers FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);
CREATE POLICY "Users can update own borrowers" ON borrowers FOR UPDATE USING (auth.uid() = loan_officer_id);

-- Properties
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
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

DROP POLICY IF EXISTS "Users can view own properties" ON properties;
DROP POLICY IF EXISTS "Users can insert own properties" ON properties;
DROP POLICY IF EXISTS "Users can update own properties" ON properties;

CREATE POLICY "Users can view own properties" ON properties FOR SELECT USING (auth.uid() = loan_officer_id);
CREATE POLICY "Users can insert own properties" ON properties FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);
CREATE POLICY "Users can update own properties" ON properties FOR UPDATE USING (auth.uid() = loan_officer_id);

-- Mortgages
CREATE TABLE IF NOT EXISTS mortgages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lender_name TEXT,
    loan_type TEXT,
    loan_balance NUMERIC(12,2) NOT NULL,
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

DROP POLICY IF EXISTS "Users can view own mortgages" ON mortgages;
DROP POLICY IF EXISTS "Users can insert own mortgages" ON mortgages;
DROP POLICY IF EXISTS "Users can update own mortgages" ON mortgages;

CREATE POLICY "Users can view own mortgages" ON mortgages FOR SELECT USING (auth.uid() = loan_officer_id);
CREATE POLICY "Users can insert own mortgages" ON mortgages FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);
CREATE POLICY "Users can update own mortgages" ON mortgages FOR UPDATE USING (auth.uid() = loan_officer_id);

-- Deal Radar
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
    confidence_score NUMERIC(3,2),
    qualification_status TEXT,
    status TEXT DEFAULT 'new',
    priority_score INTEGER,
    ai_analysis TEXT,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_radar_loan_officer ON deal_radar(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_deal_radar_status ON deal_radar(status);
CREATE INDEX IF NOT EXISTS idx_deal_radar_priority ON deal_radar(priority_score DESC);

ALTER TABLE deal_radar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own deal opportunities" ON deal_radar;
DROP POLICY IF EXISTS "Users can insert own deal opportunities" ON deal_radar;
DROP POLICY IF EXISTS "Users can update own deal opportunities" ON deal_radar;

CREATE POLICY "Users can view own deal opportunities" ON deal_radar FOR SELECT USING (auth.uid() = loan_officer_id);
CREATE POLICY "Users can insert own deal opportunities" ON deal_radar FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);
CREATE POLICY "Users can update own deal opportunities" ON deal_radar FOR UPDATE USING (auth.uid() = loan_officer_id);

-- Deal Radar Scans
CREATE TABLE IF NOT EXISTS deal_radar_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scan_type TEXT NOT NULL,
    borrowers_scanned INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    total_tappable_equity NUMERIC(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE deal_radar_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own scan logs" ON deal_radar_scans;
CREATE POLICY "Users can view own scan logs" ON deal_radar_scans FOR SELECT USING (auth.uid() = loan_officer_id);

-- ============================================
-- 6. HELPER FUNCTIONS
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

-- ============================================
-- 7. VECTOR SEARCH FUNCTION
-- ============================================
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
-- 8. SEED KNOWLEDGE BASE
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, metadata) VALUES
(
    'sales_scripts',
    'HELOC Value Proposition',
    'A HELOC gives homeowners financial flexibility. Think of it as a safety net that turns your home equity into accessible cash. You only pay interest on what you use, not the full credit line.',
    '{"tags": ["value_prop", "introduction"], "source": "sales_training"}'
),
(
    'objections',
    'Rate Concern Response',
    'I understand rate is important. With a HELOC, you have flexibility - you can lock in portions at fixed rates when rates are favorable, while keeping the rest as a low-cost safety net.',
    '{"tags": ["rate", "objection"], "source": "sales_training"}'
),
(
    'heloc_guidelines',
    'CLTV Calculation',
    'Combined Loan-to-Value (CLTV) = (First Mortgage Balance + HELOC Amount) / Property Value. Most HELOC programs allow up to 85% CLTV for primary residences.',
    '{"tags": ["cltv", "calculation", "guidelines"], "source": "underwriting"}'
)
ON CONFLICT DO NOTHING;
