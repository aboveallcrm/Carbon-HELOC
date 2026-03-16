-- Migration: Enhanced Features for Ezra AI and Titanium
-- Date: 2024-03-16

-- ============================================
-- DOCUMENT UPLOAD STORAGE
-- ============================================

-- Create storage bucket for loan documents (if not exists)
-- Note: This needs to be done via Supabase dashboard or API
-- INSERT INTO storage.buckets (id, name, public) VALUES ('loan-documents', 'loan-documents', false);

-- Loan documents metadata table
CREATE TABLE IF NOT EXISTS loan_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES quote_links(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    doc_type VARCHAR(50) NOT NULL, -- 'id', 'income', 'insurance', 'mortgage_statement'
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'uploaded', -- 'uploaded', 'processing', 'verified', 'rejected'
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_loan_docs_user ON loan_documents(user_id);
CREATE INDEX idx_loan_docs_quote ON loan_documents(quote_id);
CREATE INDEX idx_loan_docs_lead ON loan_documents(lead_id);
CREATE INDEX idx_loan_docs_type ON loan_documents(doc_type);

-- Enable RLS
ALTER TABLE loan_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own documents"
    ON loan_documents FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own documents"
    ON loan_documents FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own documents"
    ON loan_documents FOR UPDATE
    USING (user_id = auth.uid());

-- ============================================
-- CREDIT REPORT STORAGE
-- ============================================

CREATE TABLE IF NOT EXISTS credit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quote_links(id) ON DELETE SET NULL,
    report_data JSONB NOT NULL,
    credit_score INTEGER,
    credit_score_range VARCHAR(20), -- 'excellent', 'good', 'fair', 'poor'
    report_provider VARCHAR(50), -- 'experian', 'equifax', 'transunion', 'other'
    report_reference VARCHAR(255),
    report_date DATE,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'expired', 'disputed'
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_credit_reports_user ON credit_reports(user_id);
CREATE INDEX idx_credit_reports_lead ON credit_reports(lead_id);
CREATE INDEX idx_credit_reports_score ON credit_reports(credit_score);

ALTER TABLE credit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit reports"
    ON credit_reports FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own credit reports"
    ON credit_reports FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================
-- DTI CALCULATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS dti_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quote_links(id) ON DELETE SET NULL,
    credit_report_id UUID REFERENCES credit_reports(id) ON DELETE SET NULL,
    monthly_income DECIMAL(12,2),
    total_monthly_debts DECIMAL(12,2),
    proposed_heloc_payment DECIMAL(12,2),
    current_dti DECIMAL(5,2),
    proposed_dti DECIMAL(5,2),
    approval_status VARCHAR(50), -- 'approved', 'conditional', 'manual_review', 'denied'
    debts_json JSONB, -- Array of debts from credit report
    recommendations_json JSONB,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dti_calc_user ON dti_calculations(user_id);
CREATE INDEX idx_dti_calc_quote ON dti_calculations(quote_id);
CREATE INDEX idx_dti_calc_lead ON dti_calculations(lead_id);

ALTER TABLE dti_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own DTI calculations"
    ON dti_calculations FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own DTI calculations"
    ON dti_calculations FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================
-- PRE-QUALIFICATION CHECKS
-- ============================================

CREATE TABLE IF NOT EXISTS prequal_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quote_links(id) ON DELETE SET NULL,
    
    -- Pre-qual responses
    credit_score_range VARCHAR(20), -- '720+', '680-719', '640-679', '<640'
    has_steady_income BOOLEAN,
    has_sufficient_equity BOOLEAN,
    no_recent_bankruptcy BOOLEAN,
    
    -- Quote estimates
    estimated_home_value DECIMAL(12,2),
    estimated_mortgage_balance DECIMAL(12,2),
    estimated_heloc_amount DECIMAL(12,2),
    
    -- Results
    eligibility_score INTEGER,
    eligibility_status VARCHAR(50), -- 'approved', 'conditional', 'manual_review', 'denied'
    max_cltv DECIMAL(5,2),
    estimated_rate_range_min DECIMAL(5,2),
    estimated_rate_range_max DECIMAL(5,2),
    factors_json JSONB,
    recommendations_json JSONB,
    
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_prequal_user ON prequal_checks(user_id);
CREATE INDEX idx_prequal_lead ON prequal_checks(lead_id);
CREATE INDEX idx_prequal_status ON prequal_checks(eligibility_status);

ALTER TABLE prequal_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prequal checks"
    ON prequal_checks FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own prequal checks"
    ON prequal_checks FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================
-- LENDER SUBMISSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS lender_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quote_links(id) ON DELETE SET NULL,
    lender VARCHAR(50) NOT NULL,
    submission_data JSONB,
    status VARCHAR(50) DEFAULT 'submitted', -- 'submitted', 'in_review', 'approved', 'declined', 'pending_docs'
    lender_reference VARCHAR(255),
    lender_response JSONB,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lender_sub_user ON lender_submissions(user_id);
CREATE INDEX idx_lender_sub_lead ON lender_submissions(lead_id);
CREATE INDEX idx_lender_sub_status ON lender_submissions(status);

ALTER TABLE lender_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lender submissions"
    ON lender_submissions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own lender submissions"
    ON lender_submissions FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ============================================
-- EZRA CONTEXT SUGGESTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS ezra_context_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES quote_links(id) ON DELETE SET NULL,
    suggestion_type VARCHAR(50), -- 'warning', 'opportunity', 'error', 'info'
    title VARCHAR(255),
    message TEXT,
    action_taken BOOLEAN DEFAULT FALSE,
    action_result VARCHAR(50),
    dismissed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ezra_suggestions_user ON ezra_context_suggestions(user_id);
CREATE INDEX idx_ezra_suggestions_quote ON ezra_context_suggestions(quote_id);

ALTER TABLE ezra_context_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own suggestions"
    ON ezra_context_suggestions FOR SELECT
    USING (user_id = auth.uid());

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get latest prequal for a lead
CREATE OR REPLACE FUNCTION get_latest_prequal(p_lead_id UUID)
RETURNS TABLE (
    id UUID,
    eligibility_score INTEGER,
    eligibility_status VARCHAR,
    max_cltv DECIMAL,
    estimated_rate_range_min DECIMAL,
    estimated_rate_range_max DECIMAL,
    checked_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pq.id,
        pq.eligibility_score,
        pq.eligibility_status,
        pq.max_cltv,
        pq.estimated_rate_range_min,
        pq.estimated_rate_range_max,
        pq.checked_at
    FROM prequal_checks pq
    WHERE pq.lead_id = p_lead_id
    ORDER BY pq.checked_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get document count by type for a quote
CREATE OR REPLACE FUNCTION get_document_stats(p_quote_id UUID)
RETURNS TABLE (
    doc_type VARCHAR,
    count BIGINT,
    latest_upload TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ld.doc_type,
        COUNT(*) as count,
        MAX(ld.created_at) as latest_upload
    FROM loan_documents ld
    WHERE ld.quote_id = p_quote_id
    GROUP BY ld.doc_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
CREATE TRIGGER update_loan_documents_updated_at
    BEFORE UPDATE ON loan_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_reports_updated_at
    BEFORE UPDATE ON credit_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lender_submissions_updated_at
    BEFORE UPDATE ON lender_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE loan_documents IS 'Stores metadata for uploaded loan documents';
COMMENT ON TABLE credit_reports IS 'Stores credit report data and scores';
COMMENT ON TABLE dti_calculations IS 'Stores DTI calculations with credit report data';
COMMENT ON TABLE prequal_checks IS 'Stores pre-qualification check results';
COMMENT ON TABLE lender_submissions IS 'Tracks submissions to lenders';
COMMENT ON TABLE ezra_context_suggestions IS 'Stores Ezra AI context-aware suggestions';
