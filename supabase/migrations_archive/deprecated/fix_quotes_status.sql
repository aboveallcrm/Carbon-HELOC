-- IMMEDIATE FIX: Add status column to quotes table
-- Run this in the Supabase SQL Editor

-- 1. Add status column to quotes table
ALTER TABLE IF EXISTS quotes 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. Update existing quotes to have 'active' status
UPDATE quotes 
SET status = 'active' 
WHERE status IS NULL;

-- 3. Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- 4. Add comment for documentation
COMMENT ON COLUMN quotes.status IS 'Quote status: active, archived, deleted, converted, draft';

-- 5. Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'quotes';
