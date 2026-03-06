-- Fix: Add updated_at column to quotes table
-- The trigger update_quotes_updated_at already exists but the column was never added
-- Run this in Supabase SQL Editor

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotes' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE quotes ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

SELECT 'quotes.updated_at column ensured' AS result;
