-- Migration: Ensure quotes table exists with all required columns
-- Created: 2026-03-03

-- Create quotes table if it doesn't exist
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quote_data JSONB NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add status column if table exists but column doesn't
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE quotes ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
END $$;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);

-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own quotes" ON quotes;
DROP POLICY IF EXISTS "Users can insert own quotes" ON quotes;
DROP POLICY IF EXISTS "Users can update own quotes" ON quotes;
DROP POLICY IF EXISTS "Users can delete own quotes" ON quotes;
DROP POLICY IF EXISTS "Super admins can view all quotes" ON quotes;
DROP POLICY IF EXISTS "Super admins can delete any quotes" ON quotes;

-- Create RLS policies
CREATE POLICY "Users can view own quotes" 
    ON quotes FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quotes" 
    ON quotes FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quotes" 
    ON quotes FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own quotes" 
    ON quotes FOR DELETE 
    USING (auth.uid() = user_id);

-- Super admin policies
CREATE POLICY "Super admins can view all quotes" 
    ON quotes FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'super_admin'
    ));

CREATE POLICY "Super admins can delete any quotes" 
    ON quotes FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'super_admin'
    ));

-- Add comment for documentation
COMMENT ON TABLE quotes IS 'Stores saved HELOC quotes for users';
COMMENT ON COLUMN quotes.status IS 'Quote status: active, archived, deleted, converted, draft';

-- Update trigger for updated_at
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
