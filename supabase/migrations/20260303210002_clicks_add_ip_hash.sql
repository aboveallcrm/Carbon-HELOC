-- Fix: add ip_hash column to pre-existing clicks table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='clicks' AND column_name='ip_hash') THEN
        ALTER TABLE public.clicks ADD COLUMN ip_hash text;
    END IF;
END$$;

-- Recreate get_link_stats to use COALESCE for ip_hash/ip_address compatibility
DROP FUNCTION IF EXISTS public.get_link_stats(text);
CREATE OR REPLACE FUNCTION public.get_link_stats(p_slug text)
RETURNS TABLE (
    total_clicks bigint,
    unique_devices bigint,
    last_click timestamptz,
    top_device text,
    top_city text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link_id uuid;
BEGIN
    SELECT id INTO v_link_id FROM public.links WHERE slug = p_slug;
    IF v_link_id IS NULL THEN
        RETURN QUERY SELECT 0::bigint, 0::bigint, NULL::timestamptz, NULL::text, NULL::text;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_clicks,
        COUNT(DISTINCT COALESCE(c.ip_hash, c.ip_address))::bigint AS unique_devices,
        MAX(c.clicked_at) AS last_click,
        (SELECT c2.device_type FROM public.clicks c2
         WHERE c2.link_id = v_link_id AND c2.device_type IS NOT NULL
         GROUP BY c2.device_type ORDER BY COUNT(*) DESC LIMIT 1) AS top_device,
        (SELECT c3.city FROM public.clicks c3
         WHERE c3.link_id = v_link_id AND c3.city IS NOT NULL
         GROUP BY c3.city ORDER BY COUNT(*) DESC LIMIT 1) AS top_city
    FROM public.clicks c
    WHERE c.link_id = v_link_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_link_stats(text) TO anon, authenticated;
