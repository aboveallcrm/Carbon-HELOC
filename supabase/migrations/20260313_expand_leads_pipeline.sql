-- Expand leads pipeline statuses to support Bonzo + GHL stage mapping
-- New statuses: quoted, application_sent, in_underwriting, approved, docs_out, funded, on_hold
-- Maps: new→contacted→qualified→quoted→app_sent→underwriting→approved→docs_out→funded
-- Also: on_hold, lost (existing)

-- Drop old constraint and recreate with all pipeline stages
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (lower(status) IN (
        'new', 'contacted', 'qualified', 'quoted',
        'application_sent', 'in_underwriting', 'approved', 'docs_out', 'funded',
        'on_hold', 'lost',
        -- Legacy values (backward compat for existing data)
        'closed'
    ));

-- Migrate any 'closed' status to 'funded' (same meaning)
UPDATE leads SET status = 'funded' WHERE lower(status) = 'closed';

-- Add loan_type column if not exists (some leads store this in metadata only)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'loan_type') THEN
        ALTER TABLE leads ADD COLUMN loan_type text;
    END IF;
END $$;

-- Add property_type column if not exists
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'property_type') THEN
        ALTER TABLE leads ADD COLUMN property_type text;
    END IF;
END $$;

-- Backfill loan_type and property_type from metadata JSONB where available
UPDATE leads SET loan_type = metadata->>'loan_type'
WHERE loan_type IS NULL AND metadata->>'loan_type' IS NOT NULL AND metadata->>'loan_type' != '';

UPDATE leads SET property_type = COALESCE(metadata->>'property_type', metadata->>'occupancy')
WHERE property_type IS NULL AND (metadata->>'property_type' IS NOT NULL OR metadata->>'occupancy' IS NOT NULL);

-- Verify
SELECT 'leads_pipeline_expanded' AS result;
