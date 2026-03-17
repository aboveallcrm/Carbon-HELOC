-- Migration: Auto-set date columns on status transitions + add reactivation/archived statuses
-- Created: 2026-03-18
-- Description: Extends log_lead_status_change() trigger to auto-populate funded_at, quote_sent_at
--              Adds 'reactivation' and 'archived' statuses for lifecycle management

-- ============================================
-- PART 1: Expand status constraint
-- ============================================
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (lower(status) IN (
        'new', 'contacted', 'qualified', 'quoted',
        'application_sent', 'in_underwriting', 'approved', 'docs_out', 'funded',
        'on_hold', 'lost',
        -- New lifecycle statuses
        'reactivation', 'archived',
        -- Legacy (backward compat)
        'closed'
    ));

-- ============================================
-- PART 2: Extend trigger to auto-set date columns
-- ============================================
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Audit log entry
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
            COALESCE(NEW.status_changed_at, NOW()),
            NEW.notes,
            jsonb_build_object(
                'source', NEW.crm_source,
                'sync_status', NEW.sync_status
            )
        );

        -- Update the status change timestamp
        NEW.status_changed_at = NOW();

        -- Auto-set funded_at when status changes to 'funded'
        IF lower(NEW.status) = 'funded' THEN
            NEW.funded_at = NOW();
        END IF;

        -- Auto-set quote_sent_at when status changes to 'quoted' (only if not already set)
        IF lower(NEW.status) = 'quoted' AND OLD.quote_sent_at IS NULL THEN
            NEW.quote_sent_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger already exists (trigger_log_lead_status_change), no need to recreate
-- The CREATE OR REPLACE FUNCTION above updates the function the trigger calls

-- ============================================
-- PART 3: Backfill funded_at for existing funded leads
-- ============================================
UPDATE leads
SET funded_at = COALESCE(status_changed_at, updated_at, created_at)
WHERE lower(status) = 'funded' AND funded_at IS NULL;

-- Backfill quote_sent_at for existing quoted leads
UPDATE leads
SET quote_sent_at = COALESCE(status_changed_at, updated_at, created_at)
WHERE lower(status) = 'quoted' AND quote_sent_at IS NULL;

-- ============================================
-- PART 4: Add CRM status map to CRM_STATUS_MAP
-- ============================================
-- Update lead_status_options if it exists
INSERT INTO lead_status_options (status_key, label, category, color, sort_order, requires_date, date_field)
VALUES
    ('reactivation', 'Reactivation', 'active', '#f97316', 335, false, NULL),
    ('archived', 'Archived', 'closed', '#4b5563', 370, false, NULL)
ON CONFLICT (status_key) DO NOTHING;

SELECT 'lead_status_dates_trigger_updated' AS result;
