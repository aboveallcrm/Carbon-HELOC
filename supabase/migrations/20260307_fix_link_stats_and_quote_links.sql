-- ============================================================
-- FIX 1: get_link_stats references non-existent c.ip_address
-- The clicks table only has ip_hash (not ip_address).
-- ============================================================
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
        COUNT(DISTINCT c.ip_hash)::bigint AS unique_devices,
        MAX(c.clicked_at) AS last_click,
        (SELECT c2.device_type::text FROM public.clicks c2
         WHERE c2.link_id = v_link_id AND c2.device_type IS NOT NULL
         GROUP BY c2.device_type ORDER BY COUNT(*) DESC LIMIT 1) AS top_device,
        (SELECT c3.city::text FROM public.clicks c3
         WHERE c3.link_id = v_link_id AND c3.city IS NOT NULL
         GROUP BY c3.city ORDER BY COUNT(*) DESC LIMIT 1) AS top_city
    FROM public.clicks c
    WHERE c.link_id = v_link_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_link_stats(text) TO anon, authenticated;

-- ============================================================
-- FIX 2: quote_links anon UPDATE policy is over-permissive
-- Replace WITH CHECK (true) with an RPC for view_count increment
-- ============================================================

-- Drop the over-permissive anon UPDATE policy
DROP POLICY IF EXISTS "Public can update view count" ON public.quote_links;

-- Create a SECURITY DEFINER RPC that only increments view_count
CREATE OR REPLACE FUNCTION public.increment_quote_view(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.quote_links
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE code = p_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_quote_view(text) TO anon, authenticated;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT 'Link stats fix + quote_links policy fix complete' AS result;
