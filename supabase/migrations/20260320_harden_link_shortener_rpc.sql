-- Harden link shortener RPCs for SaaS production use.
-- Anonymous callers should not be able to create links or read click analytics.

CREATE OR REPLACE FUNCTION public.create_short_link(
    p_destination_url text,
    p_title text DEFAULT 'Short Link',
    p_category text DEFAULT 'general',
    p_domain text DEFAULT 'go.aboveallcrm.com',
    p_custom_slug text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_lead_id uuid DEFAULT NULL,
    p_utm_source text DEFAULT NULL,
    p_utm_medium text DEFAULT NULL,
    p_utm_campaign text DEFAULT NULL
)
RETURNS TABLE (
    out_id uuid,
    out_short_url text,
    out_slug text,
    out_destination_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_effective_user_id uuid;
    v_lead_user_id uuid;
    v_slug text;
    v_id uuid;
    v_short_url text;
    v_domain text;
    v_attempts int := 0;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> v_actor_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Cannot create links for another user';
    END IF;

    v_effective_user_id := COALESCE(p_user_id, v_actor_id);

    IF p_lead_id IS NOT NULL THEN
        SELECT user_id INTO v_lead_user_id
        FROM public.leads
        WHERE id = p_lead_id;

        IF v_lead_user_id IS NULL THEN
            RAISE EXCEPTION 'Lead not found';
        END IF;

        IF v_lead_user_id <> v_effective_user_id AND NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'Lead does not belong to current user';
        END IF;
    END IF;

    v_domain := COALESCE(NULLIF(TRIM(p_domain), ''), 'go.aboveallcrm.com');
    IF v_domain NOT LIKE 'http%' THEN
        v_domain := 'https://' || v_domain;
    END IF;

    IF p_custom_slug IS NOT NULL AND TRIM(p_custom_slug) <> '' THEN
        v_slug := TRIM(p_custom_slug);
        IF EXISTS (SELECT 1 FROM public.links WHERE slug = v_slug) THEN
            RAISE EXCEPTION 'Slug "%" already exists', v_slug;
        END IF;
    ELSE
        LOOP
            v_slug := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.links WHERE slug = v_slug);
            v_attempts := v_attempts + 1;
            IF v_attempts > 10 THEN
                v_slug := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
                EXIT WHEN NOT EXISTS (SELECT 1 FROM public.links WHERE slug = v_slug);
                RAISE EXCEPTION 'Could not generate unique slug';
            END IF;
        END LOOP;
    END IF;

    v_short_url := v_domain || '/' || v_slug;

    INSERT INTO public.links (
        slug,
        destination_url,
        short_url,
        domain,
        title,
        category,
        user_id,
        lead_id,
        utm_source,
        utm_medium,
        utm_campaign
    )
    VALUES (
        v_slug,
        p_destination_url,
        v_short_url,
        v_domain,
        p_title,
        p_category,
        v_effective_user_id,
        p_lead_id,
        p_utm_source,
        p_utm_medium,
        p_utm_campaign
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_short_url, v_slug, p_destination_url;
END;
$$;

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
    v_actor_id uuid := auth.uid();
    v_link_id uuid;
    v_owner_id uuid;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT id, user_id INTO v_link_id, v_owner_id
    FROM public.links
    WHERE slug = p_slug;

    IF v_link_id IS NULL THEN
        RETURN QUERY SELECT 0::bigint, 0::bigint, NULL::timestamptz, NULL::text, NULL::text;
        RETURN;
    END IF;

    IF v_owner_id IS NULL OR (v_owner_id <> v_actor_id AND NOT public.is_super_admin()) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_clicks,
        COUNT(DISTINCT c.ip_hash)::bigint AS unique_devices,
        MAX(c.clicked_at) AS last_click,
        (
            SELECT c2.device_type
            FROM public.clicks c2
            WHERE c2.link_id = v_link_id AND c2.device_type IS NOT NULL
            GROUP BY c2.device_type
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS top_device,
        (
            SELECT c3.city
            FROM public.clicks c3
            WHERE c3.link_id = v_link_id AND c3.city IS NOT NULL
            GROUP BY c3.city
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS top_city
    FROM public.clicks c
    WHERE c.link_id = v_link_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_short_link(text, text, text, text, text, uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_short_link(text, text, text, text, text, uuid, uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_link_stats(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_link_stats(text) TO authenticated;
