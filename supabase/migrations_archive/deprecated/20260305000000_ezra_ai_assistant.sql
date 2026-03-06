-- Migration: Ezra AI Loan Structuring Assistant
-- Created: 2026-03-05
-- Description: Complete schema for Ezra AI assistant including conversations, knowledge base with vector search, and quote memory

-- ============================================
-- 1. ENABLE PGVECTOR EXTENSION
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 2. EZRA CONVERSATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT UNIQUE NOT NULL, -- External reference ID
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    borrower_id UUID REFERENCES leads(id) ON DELETE SET NULL, -- Optional link to lead
    borrower_name TEXT,
    conversation_summary TEXT,
    quote_data JSONB DEFAULT '{}', -- Stored quote structure
    tier_access TEXT CHECK (tier_access IN ('obsidian', 'diamond')) DEFAULT 'diamond',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ezra_conversations
CREATE INDEX IF NOT EXISTS idx_ezra_conv_loan_officer ON ezra_conversations(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_ezra_conv_borrower ON ezra_conversations(borrower_id);
CREATE INDEX IF NOT EXISTS idx_ezra_conv_status ON ezra_conversations(status);
CREATE INDEX IF NOT EXISTS idx_ezra_conv_created_at ON ezra_conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_ezra_conv_quote_data ON ezra_conversations USING GIN(quote_data);

-- Enable RLS
ALTER TABLE ezra_conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own ezra conversations" ON ezra_conversations;
DROP POLICY IF EXISTS "Users can insert own ezra conversations" ON ezra_conversations;
DROP POLICY IF EXISTS "Users can update own ezra conversations" ON ezra_conversations;
DROP POLICY IF EXISTS "Users can delete own ezra conversations" ON ezra_conversations;
DROP POLICY IF EXISTS "Super admins can view all ezra conversations" ON ezra_conversations;

-- Create RLS policies
CREATE POLICY "Users can view own ezra conversations" 
    ON ezra_conversations FOR SELECT 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can insert own ezra conversations" 
    ON ezra_conversations FOR INSERT 
    WITH CHECK (auth.uid() = loan_officer_id);

CREATE POLICY "Users can update own ezra conversations" 
    ON ezra_conversations FOR UPDATE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can delete own ezra conversations" 
    ON ezra_conversations FOR DELETE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Super admins can view all ezra conversations"
    ON ezra_conversations FOR ALL
    USING (public.is_super_admin());

-- ============================================
-- 3. EZRA MESSAGES TABLE (Conversation History)
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ezra_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model_used TEXT, -- gemini, claude, gpt
    metadata JSONB DEFAULT '{}', -- tokens, latency, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ezra_messages
CREATE INDEX IF NOT EXISTS idx_ezra_msg_conversation ON ezra_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ezra_msg_created_at ON ezra_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ezra_msg_role ON ezra_messages(role);

-- Enable RLS
ALTER TABLE ezra_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view messages from own conversations" ON ezra_messages;
DROP POLICY IF EXISTS "Users can insert messages to own conversations" ON ezra_messages;

-- Create RLS policies
CREATE POLICY "Users can view messages from own conversations" 
    ON ezra_messages FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM ezra_conversations 
        WHERE ezra_conversations.id = ezra_messages.conversation_id 
        AND ezra_conversations.loan_officer_id = auth.uid()
    ));

CREATE POLICY "Users can insert messages to own conversations" 
    ON ezra_messages FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM ezra_conversations 
        WHERE ezra_conversations.id = ezra_messages.conversation_id 
        AND ezra_conversations.loan_officer_id = auth.uid()
    ));

-- ============================================
-- 4. EZRA KNOWLEDGE BASE (with Vector Search)
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- 'heloc_guidelines', 'sales_scripts', 'loan_programs', 'objections', 'internal_docs'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_vector vector(1536), -- OpenAI text-embedding-3-small dimensions
    metadata JSONB DEFAULT '{}', -- source, tags, last_updated_by
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ezra_knowledge_base
CREATE INDEX IF NOT EXISTS idx_ezra_kb_category ON ezra_knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_ezra_kb_active ON ezra_knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_ezra_kb_vector ON ezra_knowledge_base USING ivfflat (content_vector vector_cosine_ops);

-- Enable RLS
ALTER TABLE ezra_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view active knowledge base entries" ON ezra_knowledge_base;
DROP POLICY IF EXISTS "Super admins can manage knowledge base" ON ezra_knowledge_base;

-- Create RLS policies
CREATE POLICY "Anyone can view active knowledge base entries" 
    ON ezra_knowledge_base FOR SELECT 
    USING (is_active = true);

CREATE POLICY "Super admins can manage knowledge base"
    ON ezra_knowledge_base FOR ALL
    USING (public.is_super_admin());

-- ============================================
-- 5. EZRA LOAN SCENARIOS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_loan_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES ezra_conversations(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    borrower_name TEXT,
    scenario_data JSONB NOT NULL DEFAULT '{}', -- Complete loan structure
    strategy_notes TEXT,
    approval_probability INTEGER CHECK (approval_probability >= 0 AND approval_probability <= 100),
    is_favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ezra_loan_scenarios
CREATE INDEX IF NOT EXISTS idx_ezra_scenarios_loan_officer ON ezra_loan_scenarios(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_ezra_scenarios_conversation ON ezra_loan_scenarios(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ezra_scenarios_favorite ON ezra_loan_scenarios(is_favorite);
CREATE INDEX IF NOT EXISTS idx_ezra_scenarios_created_at ON ezra_loan_scenarios(created_at);

-- Enable RLS
ALTER TABLE ezra_loan_scenarios ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own loan scenarios" ON ezra_loan_scenarios;
DROP POLICY IF EXISTS "Users can insert own loan scenarios" ON ezra_loan_scenarios;
DROP POLICY IF EXISTS "Users can update own loan scenarios" ON ezra_loan_scenarios;
DROP POLICY IF EXISTS "Users can delete own loan scenarios" ON ezra_loan_scenarios;

-- Create RLS policies
CREATE POLICY "Users can view own loan scenarios" 
    ON ezra_loan_scenarios FOR SELECT 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can insert own loan scenarios" 
    ON ezra_loan_scenarios FOR INSERT 
    WITH CHECK (auth.uid() = loan_officer_id);

CREATE POLICY "Users can update own loan scenarios" 
    ON ezra_loan_scenarios FOR UPDATE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can delete own loan scenarios" 
    ON ezra_loan_scenarios FOR DELETE 
    USING (auth.uid() = loan_officer_id);

-- ============================================
-- 6. EZRA QUICK ACTIONS TABLE (User Preferences)
-- ============================================
CREATE TABLE IF NOT EXISTS ezra_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_model TEXT DEFAULT 'claude' CHECK (preferred_model IN ('gemini', 'claude', 'gpt')),
    quick_commands JSONB DEFAULT '["Create Quote", "Structure Deal", "Handle Objection", "Explain Loan Strategy", "Generate Client Script"]',
    default_tier TEXT DEFAULT 'diamond' CHECK (default_tier IN ('obsidian', 'diamond')),
    auto_fill_enabled BOOLEAN DEFAULT true,
    sales_coach_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(loan_officer_id)
);

-- Enable RLS
ALTER TABLE ezra_user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own preferences" ON ezra_user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON ezra_user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON ezra_user_preferences;

-- Create RLS policies
CREATE POLICY "Users can view own preferences" 
    ON ezra_user_preferences FOR SELECT 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can insert own preferences" 
    ON ezra_user_preferences FOR INSERT 
    WITH CHECK (auth.uid() = loan_officer_id);

CREATE POLICY "Users can update own preferences" 
    ON ezra_user_preferences FOR UPDATE 
    USING (auth.uid() = loan_officer_id);

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
-- 8. FUNCTION TO GET CONVERSATION HISTORY
-- ============================================
CREATE OR REPLACE FUNCTION get_conversation_history(
    p_conversation_id UUID,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    role TEXT,
    content TEXT,
    model_used TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.role,
        m.content,
        m.model_used,
        m.created_at
    FROM ezra_messages m
    WHERE m.conversation_id = p_conversation_id
    ORDER BY m.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. UPDATE TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_ezra_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_ezra_conversations_updated_at ON ezra_conversations;
DROP TRIGGER IF EXISTS update_ezra_knowledge_base_updated_at ON ezra_knowledge_base;
DROP TRIGGER IF EXISTS update_ezra_loan_scenarios_updated_at ON ezra_loan_scenarios;
DROP TRIGGER IF EXISTS update_ezra_user_preferences_updated_at ON ezra_user_preferences;

-- Create triggers
CREATE TRIGGER update_ezra_conversations_updated_at
    BEFORE UPDATE ON ezra_conversations
    FOR EACH ROW EXECUTE FUNCTION update_ezra_updated_at();

CREATE TRIGGER update_ezra_knowledge_base_updated_at
    BEFORE UPDATE ON ezra_knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_ezra_updated_at();

CREATE TRIGGER update_ezra_loan_scenarios_updated_at
    BEFORE UPDATE ON ezra_loan_scenarios
    FOR EACH ROW EXECUTE FUNCTION update_ezra_updated_at();

CREATE TRIGGER update_ezra_user_preferences_updated_at
    BEFORE UPDATE ON ezra_user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_ezra_updated_at();

-- ============================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE ezra_conversations IS 'Stores Ezra AI conversation sessions with loan officers';
COMMENT ON TABLE ezra_messages IS 'Individual messages within Ezra conversations';
COMMENT ON TABLE ezra_knowledge_base IS 'Vector-enabled knowledge base for Ezra AI responses';
COMMENT ON TABLE ezra_loan_scenarios IS 'Saved loan structures and deal strategies';
COMMENT ON TABLE ezra_user_preferences IS 'User-specific Ezra settings and preferences';
COMMENT ON FUNCTION search_ezra_knowledge IS 'Performs vector similarity search on knowledge base';

-- ============================================
-- 11. SEED DATA - Sample Knowledge Base Entries
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
),
(
    'loan_programs',
    'Fixed Rate HELOC',
    'Fixed Rate HELOC allows borrowers to lock portions of their credit line at a fixed rate. Provides payment stability while maintaining access to equity.',
    '{"tags": ["fixed_rate", "product"], "source": "product_guide"}'
)
ON CONFLICT DO NOTHING;
