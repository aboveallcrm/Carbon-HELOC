-- Migration: Deal Radar - Equity Opportunity Scanner
-- Created: 2026-03-05
-- Description: Complete deal intelligence system for automated equity opportunity detection

-- ============================================
-- 1. BORROWERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    credit_score INTEGER CHECK (credit_score >= 300 AND credit_score <= 850),
    date_of_birth DATE,
    employment_status TEXT CHECK (employment_status IN ('employed', 'self_employed', 'retired', 'unemployed')),
    annual_income NUMERIC(12,2),
    debt_to_income_ratio NUMERIC(5,2),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'converted', 'lost')),
    source TEXT DEFAULT 'manual', -- manual, import, website, referral
    tags TEXT[], -- Array of tags for segmentation
    notes TEXT,
    last_contact_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for borrowers
CREATE INDEX IF NOT EXISTS idx_borrowers_loan_officer ON borrowers(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_borrowers_status ON borrowers(status);
CREATE INDEX IF NOT EXISTS idx_borrowers_credit_score ON borrowers(credit_score);
CREATE INDEX IF NOT EXISTS idx_borrowers_created_at ON borrowers(created_at);
CREATE INDEX IF NOT EXISTS idx_borrowers_name ON borrowers(last_name, first_name);

-- Enable RLS
ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own borrowers" ON borrowers;
DROP POLICY IF EXISTS "Users can insert own borrowers" ON borrowers;
DROP POLICY IF EXISTS "Users can update own borrowers" ON borrowers;
DROP POLICY IF EXISTS "Users can delete own borrowers" ON borrowers;
DROP POLICY IF EXISTS "Super admins can view all borrowers" ON borrowers;

-- Create RLS policies
CREATE POLICY "Users can view own borrowers" 
    ON borrowers FOR SELECT 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can insert own borrowers" 
    ON borrowers FOR INSERT 
    WITH CHECK (auth.uid() = loan_officer_id);

CREATE POLICY "Users can update own borrowers" 
    ON borrowers FOR UPDATE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can delete own borrowers" 
    ON borrowers FOR DELETE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Super admins can view all borrowers"
    ON borrowers FOR SELECT
    USING (public.is_super_admin());

-- ============================================
-- 2. PROPERTIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    property_type TEXT CHECK (property_type IN ('single_family', 'condo', 'townhouse', 'multi_family', 'commercial')),
    occupancy_type TEXT CHECK (occupancy_type IN ('primary', 'secondary', 'investment')),
    estimated_value NUMERIC(12,2),
    value_confidence TEXT CHECK (value_confidence IN ('high', 'medium', 'low', 'estimated')),
    value_source TEXT, -- appraisal, zestimate, user_input, avm
    year_built INTEGER,
    square_footage INTEGER,
    lot_size_sqft INTEGER,
    bedrooms INTEGER,
    bathrooms NUMERIC(3,1),
    is_primary_residence BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for properties
CREATE INDEX IF NOT EXISTS idx_properties_borrower ON properties(borrower_id);
CREATE INDEX IF NOT EXISTS idx_properties_loan_officer ON properties(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties(state);
CREATE INDEX IF NOT EXISTS idx_properties_value ON properties(estimated_value);

-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own properties" ON properties;
DROP POLICY IF EXISTS "Users can insert own properties" ON properties;
DROP POLICY IF EXISTS "Users can update own properties" ON properties;
DROP POLICY IF EXISTS "Users can delete own properties" ON properties;

-- Create RLS policies
CREATE POLICY "Users can view own properties" 
    ON properties FOR SELECT 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can insert own properties" 
    ON properties FOR INSERT 
    WITH CHECK (auth.uid() = loan_officer_id);

CREATE POLICY "Users can update own properties" 
    ON properties FOR UPDATE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can delete own properties" 
    ON properties FOR DELETE 
    USING (auth.uid() = loan_officer_id);

-- ============================================
-- 3. MORTGAGES TABLE (Existing Liens)
-- ============================================
CREATE TABLE IF NOT EXISTS mortgages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lender_name TEXT,
    loan_type TEXT CHECK (loan_type IN ('conventional', 'fha', 'va', 'usda', 'jumbo', 'heloc', 'other')),
    loan_balance NUMERIC(12,2) NOT NULL,
    original_loan_amount NUMERIC(12,2),
    interest_rate NUMERIC(5,3),
    loan_term_years INTEGER,
    monthly_payment NUMERIC(10,2),
    is_fixed_rate BOOLEAN DEFAULT true,
    rate_type TEXT CHECK (rate_type IN ('fixed', 'arm', 'interest_only')),
    lien_position INTEGER DEFAULT 1 CHECK (lien_position IN (1, 2, 3)),
    origination_date DATE,
    maturity_date DATE,
    prepayment_penalty BOOLEAN DEFAULT false,
    is_assumable BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'refinanced', 'sold')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for mortgages
CREATE INDEX IF NOT EXISTS idx_mortgages_borrower ON mortgages(borrower_id);
CREATE INDEX IF NOT EXISTS idx_mortgages_property ON mortgages(property_id);
CREATE INDEX IF NOT EXISTS idx_mortgages_loan_officer ON mortgages(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_mortgages_status ON mortgages(status);

-- Enable RLS
ALTER TABLE mortgages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own mortgages" ON mortgages;
DROP POLICY IF EXISTS "Users can insert own mortgages" ON mortgages;
DROP POLICY IF EXISTS "Users can update own mortgages" ON mortgages;
DROP POLICY IF EXISTS "Users can delete own mortgages" ON mortgages;

-- Create RLS policies
CREATE POLICY "Users can view own mortgages" 
    ON mortgages FOR SELECT 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can insert own mortgages" 
    ON mortgages FOR INSERT 
    WITH CHECK (auth.uid() = loan_officer_id);

CREATE POLICY "Users can update own mortgages" 
    ON mortgages FOR UPDATE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can delete own mortgages" 
    ON mortgages FOR DELETE 
    USING (auth.uid() = loan_officer_id);

-- ============================================
-- 4. DEAL RADAR - OPPORTUNITY SCANNER
-- ============================================
CREATE TABLE IF NOT EXISTS deal_radar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Opportunity Details
    opportunity_type TEXT NOT NULL CHECK (opportunity_type IN (
        'heloc',
        'cash_out_refi',
        'rate_reduction',
        'debt_consolidation',
        'equity_access',
        'bridge_loan',
        'investment_leverage'
    )),
    
    -- Financial Analysis
    estimated_equity NUMERIC(12,2),
    tappable_equity NUMERIC(12,2), -- Equity available for HELOC (typically 80-85% LTV minus liens)
    current_combined_ltv NUMERIC(5,2),
    max_allowed_ltv NUMERIC(5,2) DEFAULT 85.00,
    available_heloc_amount NUMERIC(12,2),
    estimated_rate NUMERIC(5,3),
    estimated_monthly_payment NUMERIC(10,2),
    estimated_savings NUMERIC(10,2), -- For refi opportunities
    
    -- Strategy
    suggested_strategy TEXT,
    recommended_product TEXT,
    optimal_loan_amount NUMERIC(12,2),
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    
    -- Qualification
    qualification_status TEXT CHECK (qualification_status IN (
        'qualified',
        'needs_review',
        'below_threshold',
        'disqualified'
    )),
    disqualification_reason TEXT,
    required_credit_score INTEGER,
    required_dti NUMERIC(5,2),
    
    -- Action Tracking
    status TEXT DEFAULT 'new' CHECK (status IN (
        'new',
        'reviewed',
        'contacted',
        'quoted',
        'converted',
        'declined',
        'expired'
    )),
    priority_score INTEGER GENERATED ALWAYS AS (
        (CASE WHEN confidence_score >= 0.8 THEN 40 ELSE 0 END) +
        (CASE WHEN tappable_equity >= 100000 THEN 30 ELSE LEAST(tappable_equity / 3333, 30)::INTEGER END) +
        (CASE WHEN qualification_status = 'qualified' THEN 20 ELSE 0 END) +
        (CASE WHEN current_combined_ltv <= 70 THEN 10 ELSE 0 END)
    ) STORED,
    
    -- Ezra AI Analysis
    ai_analysis TEXT,
    ai_recommendations JSONB,
    similar_deals_closed INTEGER DEFAULT 0,
    
    -- Timestamps
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    last_scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for deal_radar
CREATE INDEX IF NOT EXISTS idx_deal_radar_loan_officer ON deal_radar(loan_officer_id);
CREATE INDEX IF NOT EXISTS idx_deal_radar_borrower ON deal_radar(borrower_id);
CREATE INDEX IF NOT EXISTS idx_deal_radar_type ON deal_radar(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_deal_radar_status ON deal_radar(status);
CREATE INDEX IF NOT EXISTS idx_deal_radar_priority ON deal_radar(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_deal_radar_equity ON deal_radar(tappable_equity DESC);
CREATE INDEX IF NOT EXISTS idx_deal_radar_confidence ON deal_radar(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_deal_radar_expires ON deal_radar(expires_at);

-- Enable RLS
ALTER TABLE deal_radar ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own deal opportunities" ON deal_radar;
DROP POLICY IF EXISTS "Users can insert own deal opportunities" ON deal_radar;
DROP POLICY IF EXISTS "Users can update own deal opportunities" ON deal_radar;
DROP POLICY IF EXISTS "Users can delete own deal opportunities" ON deal_radar;

-- Create RLS policies
CREATE POLICY "Users can view own deal opportunities" 
    ON deal_radar FOR SELECT 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can insert own deal opportunities" 
    ON deal_radar FOR INSERT 
    WITH CHECK (auth.uid() = loan_officer_id);

CREATE POLICY "Users can update own deal opportunities" 
    ON deal_radar FOR UPDATE 
    USING (auth.uid() = loan_officer_id);

CREATE POLICY "Users can delete own deal opportunities" 
    ON deal_radar FOR DELETE 
    USING (auth.uid() = loan_officer_id);

-- ============================================
-- 5. DEAL RADAR SCAN LOG
-- ============================================
CREATE TABLE IF NOT EXISTS deal_radar_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_officer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scan_type TEXT NOT NULL CHECK (scan_type IN ('full', 'incremental', 'single_borrower')),
    borrowers_scanned INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    opportunities_by_type JSONB DEFAULT '{}',
    total_tappable_equity NUMERIC(15,2),
    scan_duration_ms INTEGER,
    triggered_by TEXT DEFAULT 'scheduled', -- scheduled, manual, api
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE deal_radar_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scan logs" 
    ON deal_radar_scans FOR SELECT 
    USING (auth.uid() = loan_officer_id);

-- ============================================
-- 6. FUNCTIONS FOR DEAL RADAR
-- ============================================

-- Function: Calculate tappable equity for a property
CREATE OR REPLACE FUNCTION calculate_tappable_equity(
    p_property_value NUMERIC,
    p_total_liens NUMERIC,
    p_max_ltv NUMERIC DEFAULT 85.0
)
RETURNS NUMERIC AS $$
DECLARE
    v_max_total_loans NUMERIC;
    v_tappable_equity NUMERIC;
BEGIN
    v_max_total_loans := p_property_value * (p_max_ltv / 100);
    v_tappable_equity := GREATEST(0, v_max_total_loans - p_total_liens);
    RETURN v_tappable_equity;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Calculate combined LTV
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

-- Function: Run Deal Radar scan for a loan officer
CREATE OR REPLACE FUNCTION scan_deal_opportunities(
    p_loan_officer_id UUID,
    p_min_equity_threshold NUMERIC DEFAULT 50000
)
RETURNS TABLE (
    opportunity_id UUID,
    borrower_name TEXT,
    opportunity_type TEXT,
    tappable_equity NUMERIC,
    confidence_score NUMERIC,
    priority_score INTEGER
) AS $$
BEGIN
    -- This is a simplified version. Full scan would be in Edge Function
    RETURN QUERY
    SELECT 
        dr.id as opportunity_id,
        b.first_name || ' ' || b.last_name as borrower_name,
        dr.opportunity_type,
        dr.tappable_equity,
        dr.confidence_score,
        dr.priority_score
    FROM deal_radar dr
    JOIN borrowers b ON b.id = dr.borrower_id
    WHERE dr.loan_officer_id = p_loan_officer_id
    AND dr.status = 'new'
    AND dr.tappable_equity >= p_min_equity_threshold
    AND dr.expires_at > NOW()
    ORDER BY dr.priority_score DESC, dr.tappable_equity DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Function: Get top opportunities dashboard
CREATE OR REPLACE FUNCTION get_deal_radar_dashboard(
    p_loan_officer_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_opportunities', COUNT(*),
        'total_tappable_equity', COALESCE(SUM(tappable_equity), 0),
        'by_type', (
            SELECT jsonb_object_agg(opportunity_type, cnt)
            FROM (
                SELECT opportunity_type, COUNT(*) as cnt
                FROM deal_radar
                WHERE loan_officer_id = p_loan_officer_id
                AND status = 'new'
                AND expires_at > NOW()
                GROUP BY opportunity_type
            ) sub
        ),
        'top_opportunities', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'borrower_id', borrower_id,
                    'type', opportunity_type,
                    'equity', tappable_equity,
                    'confidence', confidence_score,
                    'priority', priority_score
                )
            )
            FROM (
                SELECT id, borrower_id, opportunity_type, tappable_equity, confidence_score, priority_score
                FROM deal_radar
                WHERE loan_officer_id = p_loan_officer_id
                AND status = 'new'
                AND expires_at > NOW()
                ORDER BY priority_score DESC, tappable_equity DESC
                LIMIT 10
            ) sub2
        )
    )
    INTO v_result
    FROM deal_radar
    WHERE loan_officer_id = p_loan_officer_id
    AND status = 'new'
    AND expires_at > NOW();
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_deal_radar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_borrowers_updated_at ON borrowers;
DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
DROP TRIGGER IF EXISTS update_mortgages_updated_at ON mortgages;
DROP TRIGGER IF EXISTS update_deal_radar_updated_at ON deal_radar;

CREATE TRIGGER update_borrowers_updated_at
    BEFORE UPDATE ON borrowers
    FOR EACH ROW EXECUTE FUNCTION update_deal_radar_updated_at();

CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_deal_radar_updated_at();

CREATE TRIGGER update_mortgages_updated_at
    BEFORE UPDATE ON mortgages
    FOR EACH ROW EXECUTE FUNCTION update_deal_radar_updated_at();

CREATE TRIGGER update_deal_radar_updated_at
    BEFORE UPDATE ON deal_radar
    FOR EACH ROW EXECUTE FUNCTION update_deal_radar_updated_at();

-- ============================================
-- 8. COMMENTS
-- ============================================
COMMENT ON TABLE borrowers IS 'Loan officer client database';
COMMENT ON TABLE properties IS 'Properties owned by borrowers';
COMMENT ON TABLE mortgages IS 'Existing liens and loans';
COMMENT ON TABLE deal_radar IS 'AI-generated equity opportunities and deal recommendations';
COMMENT ON TABLE deal_radar_scans IS 'Audit log for deal radar scans';
COMMENT ON FUNCTION calculate_tappable_equity IS 'Calculates available equity for HELOC based on LTV limits';
COMMENT ON FUNCTION calculate_cltv IS 'Calculates combined loan-to-value ratio';
COMMENT ON FUNCTION scan_deal_opportunities IS 'Returns top deal opportunities for a loan officer';
COMMENT ON FUNCTION get_deal_radar_dashboard IS 'Returns dashboard summary of deal opportunities';

-- ============================================
-- 9. SAMPLE DATA (Optional - for testing)
-- ============================================
-- Uncomment to add sample data for testing
/*
INSERT INTO borrowers (loan_officer_id, first_name, last_name, email, phone, credit_score, annual_income, status)
SELECT 
    auth.uid(),
    'John',
    'Smith',
    'john.smith@email.com',
    '555-0101',
    740,
    120000,
    'active'
WHERE NOT EXISTS (SELECT 1 FROM borrowers WHERE email = 'john.smith@email.com');
*/
