-- Fix leads_status_check constraint to accept the values the app actually uses
-- The app uses: New, Contacted, Qualified, Closed, Quoted
-- Old constraint only allowed lowercase values

-- Drop the old constraint and re-add with correct values
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (status IN ('new', 'New', 'Contacted', 'contacted', 'Qualified', 'qualified', 'Closed', 'closed', 'Quoted', 'quoted', 'lost', 'Lost'));

-- Verify
SELECT 'leads_status_check updated' AS result;
