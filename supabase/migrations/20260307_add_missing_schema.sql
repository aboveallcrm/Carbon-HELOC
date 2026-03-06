-- ============================================
-- ADD MISSING SCHEMA PIECES
-- ALREADY RAN in Supabase SQL Editor on 2026-03-06
-- Production has file-16 Ezra tables but is missing some file-18 columns,
-- 2 tables (market_rates, ezra_scheduled_actions), and the user-assets bucket.
-- All statements are idempotent (safe to re-run).
-- ============================================

-- ============================================
-- 1. MISSING COLUMNS on existing tables
-- ============================================

-- ezra_conversations: add borrower_id, tier_access, status columns
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ezra_conversations' AND column_name='borrower_id') THEN
        ALTER TABLE ezra_conversations ADD COLUMN borrower_id UUID REFERENCES leads(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ezra_conversations' AND column_name='tier_access') THEN
        ALTER TABLE ezra_conversations ADD COLUMN tier_access TEXT DEFAULT 'diamond';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ezra_conversations' AND column_name='status') THEN
        ALTER TABLE ezra_conversations ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
END $$;

-- borrowers: add debt_to_income_ratio
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='borrowers' AND column_name='debt_to_income_ratio') THEN
        ALTER TABLE borrowers ADD COLUMN debt_to_income_ratio NUMERIC(5,2);
    END IF;
END $$;

-- properties: add occupancy_type, is_primary_residence
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='occupancy_type') THEN
        ALTER TABLE properties ADD COLUMN occupancy_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='is_primary_residence') THEN
        ALTER TABLE properties ADD COLUMN is_primary_residence BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================
-- 2. MISSING TABLES
-- ============================================

-- market_rates (used by ezra-ultimate.js Rate Defense)
CREATE TABLE IF NOT EXISTS market_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    avg_rate NUMERIC(5,3),
    rates JSONB DEFAULT '{}',
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_rates_date ON market_rates(date DESC);

-- ezra_scheduled_actions (used by ezra-complete.js)
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
DROP POLICY IF EXISTS ezra_actions_insert ON ezra_scheduled_actions;
CREATE POLICY ezra_actions_insert ON ezra_scheduled_actions FOR INSERT WITH CHECK (loan_officer_id = auth.uid());
DROP POLICY IF EXISTS ezra_actions_sa_all ON ezra_scheduled_actions;
CREATE POLICY ezra_actions_sa_all ON ezra_scheduled_actions FOR ALL USING (is_super_admin());

-- ============================================
-- 3. HELPER FUNCTIONS (CREATE OR REPLACE = safe)
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

-- Updated search function with filter_category param
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
-- 4. TRIGGERS (idempotent via DROP IF EXISTS)
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ezra_conversations_updated_at ON ezra_conversations;
CREATE TRIGGER update_ezra_conversations_updated_at BEFORE UPDATE ON ezra_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ezra_knowledge_base_updated_at ON ezra_knowledge_base;
CREATE TRIGGER update_ezra_knowledge_base_updated_at BEFORE UPDATE ON ezra_knowledge_base FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_borrowers_updated_at ON borrowers;
CREATE TRIGGER update_borrowers_updated_at BEFORE UPDATE ON borrowers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mortgages_updated_at ON mortgages;
CREATE TRIGGER update_mortgages_updated_at BEFORE UPDATE ON mortgages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_radar_updated_at ON deal_radar;
CREATE TRIGGER update_deal_radar_updated_at BEFORE UPDATE ON deal_radar FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ezra_user_prefs_updated_at ON ezra_user_preferences;
CREATE TRIGGER update_ezra_user_prefs_updated_at BEFORE UPDATE ON ezra_user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. SEED market_rates if empty
-- ============================================
INSERT INTO market_rates (date, avg_rate, rates, source)
SELECT CURRENT_DATE, 8.25, '{"rocket": 8.5, "bofa": 8.75, "wells": 8.625, "chase": 8.375}', 'initial_seed'
WHERE NOT EXISTS (SELECT 1 FROM market_rates LIMIT 1);

-- ============================================
-- 6. USER-ASSETS STORAGE BUCKET
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-assets', 'user-assets', true, 5242880, ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Users can upload own assets" ON storage.objects;
CREATE POLICY "Users can upload own assets" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'user-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can manage own assets" ON storage.objects;
CREATE POLICY "Users can manage own assets" ON storage.objects
    FOR UPDATE USING (bucket_id = 'user-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own assets" ON storage.objects;
CREATE POLICY "Users can delete own assets" ON storage.objects
    FOR DELETE USING (bucket_id = 'user-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Public read access for user assets" ON storage.objects;
CREATE POLICY "Public read access for user assets" ON storage.objects
    FOR SELECT USING (bucket_id = 'user-assets');

-- ============================================
-- VERIFY
-- ============================================
SELECT 'Schema update complete' AS result;
