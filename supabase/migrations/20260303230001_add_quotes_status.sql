-- Migration: Add status column to quotes table
-- Created: 2026-03-03

-- Add status column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE quotes ADD COLUMN status TEXT DEFAULT 'active';
        
        -- Add comment for documentation
        COMMENT ON COLUMN quotes.status IS 'Quote status: active, archived, deleted, converted';
        
        -- Create index for faster filtering
        CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
        
        -- Update existing quotes to have 'active' status
        UPDATE quotes SET status = 'active' WHERE status IS NULL;
    END IF;
END $$;

-- Add check constraint for valid status values (optional but recommended)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'quotes' 
        AND constraint_name = 'quotes_status_check'
    ) THEN
        ALTER TABLE quotes 
        ADD CONSTRAINT quotes_status_check 
        CHECK (status IN ('active', 'archived', 'deleted', 'converted', 'draft'));
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Constraint might already exist or table might not exist
        NULL;
END $$;
