-- Fix: add missing short_url column to links table
-- The table was created before our migration with a different schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='links' AND column_name='short_url') THEN
        ALTER TABLE public.links ADD COLUMN short_url text;
    END IF;
END$$;
