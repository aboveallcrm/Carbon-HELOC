-- FIX: create_short_link was inserting into short_links table,
-- but the redirect edge function reads from links table.
-- This caused all short links to 404 because the slug was never in the correct table.

CREATE OR REPLACE FUNCTION public.create_short_link(
    p_destination_url text,
    p_title text DEFAULT 'Short Link',
    p_category text DEFAULT 'general',
    p_domain text DEFAULT 'go.aboveallcrm.com',
    p_custom_slug text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_lead_id uuid DEFAULT NULL,
    p_contact_id uuid DEFAULT NULL,
    p_utm_source text DEFAULT NULL,
    p_utm_medium text DEFAULT NULL,
    p_utm_campaign text DEFAULT NULL
)
RETURNS TABLE(out_id uuid, out_short_url text, out_slug text, out_destination_url text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_slug text;
    v_short_url text;
    v_id uuid;
    v_domain text;
BEGIN
    -- Generate slug: use custom or random 7-char
    v_slug := COALESCE(NULLIF(TRIM(p_custom_slug), ''), substr(md5(random()::text || clock_timestamp()::text), 1, 7));

    -- Normalize domain
    v_domain := COALESCE(NULLIF(TRIM(p_domain), ''), 'go.aboveallcrm.com');
    IF v_domain LIKE 'http%' THEN
        v_short_url := v_domain || '/' || v_slug;
    ELSE
        v_short_url := 'https://' || v_domain || '/' || v_slug;
    END IF;

    -- Insert into the LINKS table (which the redirect edge function reads from)
    INSERT INTO public.links (
        slug, destination_url, title, category, domain,
        user_id, lead_id, contact_id, short_url,
        utm_source, utm_medium, utm_campaign
    )
    VALUES (
        v_slug, p_destination_url, p_title, p_category, v_domain,
        p_user_id, p_lead_id, p_contact_id, v_short_url,
        p_utm_source, p_utm_medium, p_utm_campaign
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_short_url, v_slug, p_destination_url;
END;
$$;
