-- ============================================
-- Fix Missing Columns — Run in Supabase SQL Editor
-- Adds columns that schema.sql defines but production is missing
-- ============================================

-- 1. quotes.updated_at — needed by the update_quotes_updated_at trigger
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotes' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE quotes ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Ensure the trigger exists (it may have been created before the column)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at
    BEFORE UPDATE ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. leads.metadata — JSONB column for extra lead data
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE leads ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;

-- 3. leads.dnc — Do Not Contact flag
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'dnc'
    ) THEN
        ALTER TABLE leads ADD COLUMN dnc BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 4. leads.dnc_reason
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'dnc_reason'
    ) THEN
        ALTER TABLE leads ADD COLUMN dnc_reason TEXT;
    END IF;
END $$;

-- 5. leads.dnc_updated_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'dnc_updated_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN dnc_updated_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 6. leads.crm_source
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'crm_source'
    ) THEN
        ALTER TABLE leads ADD COLUMN crm_source TEXT DEFAULT 'webhook';
    END IF;
END $$;

-- 7. leads.crm_contact_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'crm_contact_id'
    ) THEN
        ALTER TABLE leads ADD COLUMN crm_contact_id TEXT;
    END IF;
END $$;

-- Verify
SELECT 'Migration complete — all columns ensured' AS result;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'leads' ORDER BY ordinal_position;
