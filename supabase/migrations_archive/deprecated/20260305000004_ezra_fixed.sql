-- Ezra + Deal Radar - Fixed Version
-- Fixes UUID/text comparison issues

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- EZRA CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT UNIQUE NOT NULL,
    loan_officer_id UUID NOT NULL,
    borrower_name TEXT,
    conversation_summary TEXT,
    quote_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key separately
ALTER TABLE ezra_conversations 
    DROP CONSTRAINT IF EXISTS fk_ezra_conv_loan_officer;

ALTER TABLE ezra_conversations 
    ADD CONSTRAINT fk_ezra_conv_loan_officer 
    FOREIGN KEY (loan_officer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ezra_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ezra_conv_select_policy ON ezra_conversations;
DROP POLICY IF EXISTS ezra_conv_insert_policy ON ezra_conversations;
DROP POLICY IF EXISTS ezra_conv_update_policy ON ezra_conversations;

CREATE POLICY ezra_conv_select_policy ON ezra_conversations 
    FOR SELECT USING (loan_officer_id = auth.uid());

CREATE POLICY ezra_conv_insert_policy ON ezra_conversations 
    FOR INSERT WITH CHECK (loan_officer_id = auth.uid());

CREATE POLICY ezra_conv_update_policy ON ezra_conversations 
    FOR UPDATE USING (loan_officer_id = auth.uid());

-- ============================================
-- EZRA MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ezra_messages 
    DROP CONSTRAINT IF EXISTS fk_ezra_msg_conversation;

ALTER TABLE ezra_messages 
    ADD CONSTRAINT fk_ezra_msg_conversation 
    FOREIGN KEY (conversation_id) REFERENCES ezra_conversations(id) ON DELETE CASCADE;

ALTER TABLE ezra_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ezra_msg_select_policy ON ezra_messages;

CREATE POLICY ezra_msg_select_policy ON ezra_messages 
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM ezra_conversations 
            WHERE loan_officer_id = auth.uid()
        )
    );

-- ============================================
-- EZRA KNOWLEDGE BASE
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

DROP POLICY IF EXISTS ezra_kb_select_policy ON ezra_knowledge_base;

CREATE POLICY ezra_kb_select_policy ON ezra_knowledge_base 
    FOR SELECT USING (is_active = true);

-- ============================================
-- BORROWERS
-- ============================================
CREATE TABLE IF NOT EXISTS borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    credit_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE borrowers 
    DROP CONSTRAINT IF EXISTS fk_borrowers_loan_officer;

ALTER TABLE borrowers 
    ADD CONSTRAINT fk_borrowers_loan_officer 
    FOREIGN KEY (loan_officer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS borrowers_select_policy ON borrowers;
DROP POLICY IF EXISTS borrowers_insert_policy ON borrowers;

CREATE POLICY borrowers_select_policy ON borrowers 
    FOR SELECT USING (loan_officer_id = auth.uid());

CREATE POLICY borrowers_insert_policy ON borrowers 
    FOR INSERT WITH CHECK (loan_officer_id = auth.uid());

-- ============================================
-- PROPERTIES
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL,
    loan_officer_id UUID NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    estimated_value NUMERIC(12,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE properties 
    DROP CONSTRAINT IF EXISTS fk_properties_borrower;

ALTER TABLE properties 
    ADD CONSTRAINT fk_properties_borrower 
    FOREIGN KEY (borrower_id) REFERENCES borrowers(id) ON DELETE CASCADE;

ALTER TABLE properties 
    DROP CONSTRAINT IF EXISTS fk_properties_loan_officer;

ALTER TABLE properties 
    ADD CONSTRAINT fk_properties_loan_officer 
    FOREIGN KEY (loan_officer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select_policy ON properties;

CREATE POLICY properties_select_policy ON properties 
    FOR SELECT USING (loan_officer_id = auth.uid());

-- ============================================
-- MORTGAGES
-- ============================================
CREATE TABLE IF NOT EXISTS mortgages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL,
    loan_officer_id UUID NOT NULL,
    loan_balance NUMERIC(12,2),
    interest_rate NUMERIC(5,3),
    lien_position INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE mortgages 
    DROP CONSTRAINT IF EXISTS fk_mortgages_borrower;

ALTER TABLE mortgages 
    ADD CONSTRAINT fk_mortgages_borrower 
    FOREIGN KEY (borrower_id) REFERENCES borrowers(id) ON DELETE CASCADE;

ALTER TABLE mortgages 
    DROP CONSTRAINT IF EXISTS fk_mortgages_loan_officer;

ALTER TABLE mortgages 
    ADD CONSTRAINT fk_mortgages_loan_officer 
    FOREIGN KEY (loan_officer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE mortgages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mortgages_select_policy ON mortgages;

CREATE POLICY mortgages_select_policy ON mortgages 
    FOR SELECT USING (loan_officer_id = auth.uid());

-- ============================================
-- DEAL RADAR
-- ============================================
CREATE TABLE IF NOT EXISTS deal_radar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL,
    loan_officer_id UUID NOT NULL,
    opportunity_type TEXT NOT NULL,
    tappable_equity NUMERIC(12,2),
    current_combined_ltv NUMERIC(5,2),
    estimated_rate NUMERIC(5,3),
    suggested_strategy TEXT,
    confidence_score NUMERIC(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE deal_radar 
    DROP CONSTRAINT IF EXISTS fk_deal_radar_borrower;

ALTER TABLE deal_radar 
    ADD CONSTRAINT fk_deal_radar_borrower 
    FOREIGN KEY (borrower_id) REFERENCES borrowers(id) ON DELETE CASCADE;

ALTER TABLE deal_radar 
    DROP CONSTRAINT IF EXISTS fk_deal_radar_loan_officer;

ALTER TABLE deal_radar 
    ADD CONSTRAINT fk_deal_radar_loan_officer 
    FOREIGN KEY (loan_officer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE deal_radar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_radar_select_policy ON deal_radar;

CREATE POLICY deal_radar_select_policy ON deal_radar 
    FOR SELECT USING (loan_officer_id = auth.uid());

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
INSERT INTO ezra_knowledge_base (category, title, content) 
SELECT 'sales_scripts', 'HELOC Value Proposition', 'A HELOC gives homeowners financial flexibility. Think of it as a safety net that turns your home equity into accessible cash.'
WHERE NOT EXISTS (SELECT 1 FROM ezra_knowledge_base WHERE category = 'sales_scripts' AND title = 'HELOC Value Proposition');

INSERT INTO ezra_knowledge_base (category, title, content) 
SELECT 'objections', 'Rate Concern Response', 'I understand rate is important. With a HELOC, you have flexibility - you can lock in portions at fixed rates when rates are favorable.'
WHERE NOT EXISTS (SELECT 1 FROM ezra_knowledge_base WHERE category = 'objections' AND title = 'Rate Concern Response');

INSERT INTO ezra_knowledge_base (category, title, content) 
SELECT 'heloc_guidelines', 'CLTV Calculation', 'Combined Loan-to-Value (CLTV) = (First Mortgage Balance + HELOC Amount) / Property Value. Most HELOC programs allow up to 85% CLTV.'
WHERE NOT EXISTS (SELECT 1 FROM ezra_knowledge_base WHERE category = 'heloc_guidelines' AND title = 'CLTV Calculation');
