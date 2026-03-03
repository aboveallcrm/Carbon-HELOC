-- Fix: drop all triggers on clicks table that reference contact_id
-- Then recreate only our increment_link_clicks trigger

-- Drop ALL triggers on clicks (nuclear option since old triggers are broken)
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT tgname FROM pg_trigger
             WHERE tgrelid = 'public.clicks'::regclass AND NOT tgisinternal
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.tgname) || ' ON public.clicks';
    END LOOP;
END$$;

-- Also drop old trigger functions that might reference contact_id
DROP FUNCTION IF EXISTS public.handle_click_notification() CASCADE;
DROP FUNCTION IF EXISTS public.trg_click_notification() CASCADE;
DROP FUNCTION IF EXISTS public.process_click() CASCADE;

-- Recreate our clean trigger
CREATE OR REPLACE FUNCTION public.increment_link_clicks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.links SET click_count = click_count + 1 WHERE id = NEW.link_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_link_clicks
    AFTER INSERT ON public.clicks
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_link_clicks();
