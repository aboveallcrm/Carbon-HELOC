-- Migration: Enhanced Leads Status Management & CRM Sync
-- Created: 2026-03-11
-- Description: Adds comprehensive status management, CRM sync capabilities, and lead tracking

-- ============================================
-- PART 1: LEADS TABLE ENHANCEMENTS
-- ============================================

-- CRM Sync Fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_source VARCHAR(50);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_pipeline_id VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_stage_id VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_assigned_to VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_error TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sync_direction VARCHAR(10);

-- Status Management Fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rate_lock_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMP WITH TIME ZONE;

-- Additional Lead Data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS competitor_name VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualification_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS loan_amount DECIMAL(12,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS monthly_payment DECIMAL(10,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_type VARCHAR(50);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS occupancy_type VARCHAR(50);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(external_id);
CREATE INDEX IF NOT EXISTS idx_leads_crm_source ON leads(crm_source);
CREATE INDEX IF NOT EXISTS idx_leads_sync_status ON leads(sync_status);
CREATE INDEX IF NOT EXISTS idx_leads_status_changed_at ON leads(status_changed_at);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_at ON leads(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING GIN(tags);

-- ============================================
-- PART 2: LEAD STATUS LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS lead_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_logs_lead_id ON lead_status_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_status_logs_changed_at ON lead_status_logs(changed_at);
CREATE INDEX IF NOT EXISTS idx_status_logs_new_status ON lead_status_logs(new_status);

-- ============================================
-- PART 3: LEAD COMMUNICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS lead_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms', 'call', 'meeting', 'note', 'quote_sent')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject VARCHAR(255),
    content TEXT,
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'delivered', 'read', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communications_lead_id ON lead_communications(lead_id);
CREATE INDEX IF NOT EXISTS idx_communications_type ON lead_communications(type);
CREATE INDEX IF NOT EXISTS idx_communications_created_at ON lead_communications(created_at);

-- ============================================
-- PART 4: CRM INTEGRATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS crm_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    crm_type VARCHAR(50) NOT NULL CHECK (crm_type IN ('ghl', 'salesforce', 'hubspot', 'fub', 'bonzo', 'zapier', 'n8n', 'custom')),
    is_active BOOLEAN DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_enabled BOOLEAN DEFAULT true,
    sync_direction VARCHAR(20) DEFAULT 'bidirectional' CHECK (sync_direction IN ('inbound', 'outbound', 'bidirectional')),
    field_mappings JSONB DEFAULT '{}',
    webhook_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, crm_type)
);

CREATE INDEX IF NOT EXISTS idx_crm_integrations_user_id ON crm_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_integrations_crm_type ON crm_integrations(crm_type);

-- ============================================
-- PART 5: CRM SYNC QUEUE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS crm_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    crm_integration_id UUID NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON crm_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_lead_id ON crm_sync_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON crm_sync_queue(created_at);

-- ============================================
-- PART 6: USER SAVED FILTERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_saved_filters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    filter_type VARCHAR(20) NOT NULL CHECK (filter_type IN ('leads', 'quotes', 'analytics')),
    filters JSONB NOT NULL DEFAULT '{}',
    sort_by VARCHAR(50),
    sort_direction VARCHAR(4) CHECK (sort_direction IN ('asc', 'desc')),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON user_saved_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_filters_type ON user_saved_filters(filter_type);

-- ============================================
-- PART 7: LEAD STATUS OPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS lead_status_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_key VARCHAR(50) NOT NULL UNIQUE,
    status_label VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('pipeline', 'follow_up', 'closed', 'other')),
    color VARCHAR(7) DEFAULT '#6b7280',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    requires_date BOOLEAN DEFAULT false,
    date_label VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default status options
INSERT INTO lead_status_options (status_key, status_label, category, color, sort_order, requires_date, date_label) VALUES
-- Pipeline statuses
('new', 'New', 'pipeline', '#10b981', 10, false, NULL),
('contacted', 'Contacted', 'pipeline', '#3b82f6', 20, false, NULL),
('qualified', 'Qualified', 'pipeline', '#8b5cf6', 30, false, NULL),
('needs_quote', 'Needs Quote', 'pipeline', '#f59e0b', 40, false, NULL),
('quote_sent', 'Quote Sent', 'pipeline', '#06b6d4', 50, true, 'Quote Sent Date'),
('application_sent', 'Application Sent', 'pipeline', '#ec4899', 60, false, NULL),
('in_underwriting', 'In Underwriting', 'pipeline', '#f97316', 70, false, NULL),
('approved', 'Approved', 'pipeline', '#22c55e', 80, false, NULL),
('rate_locked', 'Rate Locked', 'pipeline', '#eab308', 90, true, 'Rate Lock Date'),
('docs_out', 'Docs Out', 'pipeline', '#6366f1', 100, false, NULL),
('funded', 'Funded', 'pipeline', '#10b981', 110, true, 'Funding Date'),

-- Follow-up statuses
('follow_up', 'Follow Up Needed', 'follow_up', '#f59e0b', 200, true, 'Follow-up Date'),
('nurture', 'Long-term Nurture', 'follow_up', '#64748b', 210, false, NULL),

-- Closed/Lost statuses
('not_interested', 'Not Interested', 'closed', '#ef4444', 300, false, NULL),
('disqualified', 'Disqualified', 'closed', '#dc2626', 310, false, NULL),
('went_with_competitor', 'Went with Competitor', 'closed', '#991b1b', 320, false, NULL),
('refi', 'Refinance Opportunity', 'closed', '#7c3aed', 330, false, NULL),
('on_hold', 'On Hold', 'closed', '#6b7280', 340, false, NULL),
('lost', 'Lost', 'closed', '#374151', 350, false, NULL),
('dnc', 'Do Not Call', 'closed', '#000000', 360, false, NULL)

ON CONFLICT (status_key) DO NOTHING;

-- ============================================
-- PART 8: FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for crm_integrations
DROP TRIGGER IF EXISTS update_crm_integrations_updated_at ON crm_integrations;
CREATE TRIGGER update_crm_integrations_updated_at
    BEFORE UPDATE ON crm_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_saved_filters
DROP TRIGGER IF EXISTS update_user_saved_filters_updated_at ON user_saved_filters;
CREATE TRIGGER update_user_saved_filters_updated_at
    BEFORE UPDATE ON user_saved_filters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to log status changes
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO lead_status_logs (
            lead_id,
            previous_status,
            new_status,
            changed_by,
            changed_at,
            reason,
            metadata
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.status_changed_by,
            NEW.status_changed_at,
            NEW.notes,
            jsonb_build_object(
                'source', NEW.crm_source,
                'sync_status', NEW.sync_status
            )
        );
        
        -- Update the status change timestamp
        NEW.status_changed_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for status change logging
DROP TRIGGER IF EXISTS trigger_log_lead_status_change ON leads;
CREATE TRIGGER trigger_log_lead_status_change
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION log_lead_status_change();

-- Function to create sync queue entry on lead update
CREATE OR REPLACE FUNCTION queue_crm_sync()
RETURNS TRIGGER AS $$
DECLARE
    integration_id UUID;
BEGIN
    -- Find active CRM integration for this user
    SELECT id INTO integration_id
    FROM crm_integrations
    WHERE user_id = NEW.user_id
      AND is_active = true
      AND sync_enabled = true
    LIMIT 1;
    
    IF integration_id IS NOT NULL AND NEW.sync_status = 'pending' THEN
        INSERT INTO crm_sync_queue (
            lead_id,
            crm_integration_id,
            operation,
            status,
            priority
        ) VALUES (
            NEW.id,
            integration_id,
            CASE WHEN OLD.external_id IS NULL THEN 'create' ELSE 'update' END,
            'pending',
            5
        )
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for CRM sync queue
DROP TRIGGER IF EXISTS trigger_queue_crm_sync ON leads;
CREATE TRIGGER trigger_queue_crm_sync
    AFTER UPDATE ON leads
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION queue_crm_sync();

-- ============================================
-- PART 9: VIEWS FOR ANALYTICS
-- ============================================

-- Pipeline summary view
CREATE OR REPLACE VIEW lead_pipeline_summary AS
SELECT 
    user_id,
    status,
    COUNT(*) as lead_count,
    AVG(loan_amount) as avg_loan_amount,
    SUM(loan_amount) as total_pipeline_value,
    MIN(created_at) as oldest_lead,
    MAX(updated_at) as last_activity
FROM leads
WHERE status NOT IN ('funded', 'lost', 'dnc', 'not_interested')
GROUP BY user_id, status;

-- Leads requiring attention view
CREATE OR REPLACE VIEW leads_requiring_attention AS
SELECT 
    l.*,
    s.status_label,
    s.category,
    s.color
FROM leads l
JOIN lead_status_options s ON l.status = s.status_key
WHERE 
    -- Follow-up due
    (l.follow_up_at <= NOW() AND l.status = 'follow_up')
    OR
    -- Rate lock expiring in 3 days
    (l.rate_lock_expires_at <= NOW() + INTERVAL '3 days' AND l.status = 'rate_locked')
    OR
    -- No activity in 7 days for active leads
    (l.last_contact_at < NOW() - INTERVAL '7 days' 
     AND l.status IN ('new', 'contacted', 'qualified', 'quote_sent'))
    OR
    -- Quote sent but no response in 3 days
    (l.quote_sent_at < NOW() - INTERVAL '3 days' 
     AND l.status = 'quote_sent'
     AND (l.last_contact_at IS NULL OR l.last_contact_at < l.quote_sent_at));

-- ============================================
-- PART 10: ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE lead_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_status_options ENABLE ROW LEVEL SECURITY;

-- Policies for lead_status_logs
DROP POLICY IF EXISTS "Users can view their own lead status logs" ON lead_status_logs;
CREATE POLICY "Users can view their own lead status logs"
    ON lead_status_logs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM leads WHERE leads.id = lead_status_logs.lead_id AND leads.user_id = auth.uid()
    ));

-- Policies for lead_communications
DROP POLICY IF EXISTS "Users can view their own lead communications" ON lead_communications;
CREATE POLICY "Users can view their own lead communications"
    ON lead_communications FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM leads WHERE leads.id = lead_communications.lead_id AND leads.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can create lead communications" ON lead_communications;
CREATE POLICY "Users can create lead communications"
    ON lead_communications FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM leads WHERE leads.id = lead_communications.lead_id AND leads.user_id = auth.uid()
    ));

-- Policies for crm_integrations
DROP POLICY IF EXISTS "Users can manage their own CRM integrations" ON crm_integrations;
CREATE POLICY "Users can manage their own CRM integrations"
    ON crm_integrations FOR ALL
    USING (user_id = auth.uid());

-- Policies for crm_sync_queue
DROP POLICY IF EXISTS "Users can view their own sync queue" ON crm_sync_queue;
CREATE POLICY "Users can view their own sync queue"
    ON crm_sync_queue FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM leads WHERE leads.id = crm_sync_queue.lead_id AND leads.user_id = auth.uid()
    ));

-- Policies for user_saved_filters
DROP POLICY IF EXISTS "Users can manage their own saved filters" ON user_saved_filters;
CREATE POLICY "Users can manage their own saved filters"
    ON user_saved_filters FOR ALL
    USING (user_id = auth.uid());

-- Policies for lead_status_options (read-only for all authenticated users)
DROP POLICY IF EXISTS "All users can view status options" ON lead_status_options;
CREATE POLICY "All users can view status options"
    ON lead_status_options FOR SELECT
    TO authenticated
    USING (true);

-- ============================================
-- PART 11: GHL-SPECIFIC FIELDS
-- ============================================

-- Add GHL-specific fields to crm_integrations
ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS ghl_location_id VARCHAR(100);
ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS ghl_api_key_encrypted TEXT;
ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS ghl_refresh_token TEXT;
ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS ghl_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for GHL lookups
CREATE INDEX IF NOT EXISTS idx_crm_ghl_location ON crm_integrations(ghl_location_id) WHERE crm_type = 'ghl';

-- ============================================
-- COMPLETION
-- ============================================

COMMENT ON TABLE leads IS 'Enhanced leads table with CRM sync and status management';
COMMENT ON TABLE lead_status_logs IS 'Audit trail of all lead status changes';
COMMENT ON TABLE lead_communications IS 'Communication history with leads (email, SMS, calls)';
COMMENT ON TABLE crm_integrations IS 'CRM integration configurations per user';
COMMENT ON TABLE crm_sync_queue IS 'Async queue for CRM synchronization jobs';
COMMENT ON TABLE user_saved_filters IS 'User-saved filter presets for leads/quotes';
COMMENT ON TABLE lead_status_options IS 'Master list of available lead statuses';
