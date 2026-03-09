-- ============================================================
-- submit_quote_application RPC
-- Called by client-quote.html (anon key) when a client clicks
-- "Apply Now" and submits their contact info.
-- SECURITY DEFINER so anon can write to the leads table.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_quote_application(
    p_user_id UUID,
    p_lead_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT '',
    p_email TEXT DEFAULT '',
    p_phone TEXT DEFAULT '',
    p_quote_code TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_first TEXT;
    v_last TEXT;
    v_existing_id UUID;
BEGIN
    -- Split name into first/last
    v_first := split_part(p_name, ' ', 1);
    v_last  := CASE
        WHEN position(' ' in p_name) > 0
        THEN substring(p_name from position(' ' in p_name) + 1)
        ELSE ''
    END;

    -- If we have a lead_id, update that lead directly
    IF p_lead_id IS NOT NULL THEN
        UPDATE leads SET
            stage = 'application_started',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'quote_code', p_quote_code,
                'applied_at', now()::text,
                'apply_name', p_name,
                'apply_email', p_email,
                'apply_phone', p_phone
            )
        WHERE id = p_lead_id AND user_id = p_user_id;
        RETURN;
    END IF;

    -- Try to find existing lead by email (same LO)
    IF p_email <> '' THEN
        SELECT id INTO v_existing_id
        FROM leads
        WHERE user_id = p_user_id
          AND lower(email) = lower(p_email)
        LIMIT 1;
    END IF;

    -- Try by phone if no email match
    IF v_existing_id IS NULL AND p_phone <> '' THEN
        SELECT id INTO v_existing_id
        FROM leads
        WHERE user_id = p_user_id
          AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
        LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
        -- Update existing lead
        UPDATE leads SET
            stage = 'application_started',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'quote_code', p_quote_code,
                'applied_at', now()::text
            )
        WHERE id = v_existing_id;
    ELSE
        -- Insert new lead
        INSERT INTO leads (user_id, first_name, last_name, email, phone, source, stage, metadata)
        VALUES (
            p_user_id,
            v_first,
            v_last,
            p_email,
            p_phone,
            'client_quote_apply',
            'application_started',
            jsonb_build_object('quote_code', p_quote_code, 'applied_at', now()::text)
        );
    END IF;
END;
$$;

-- Grant to anon so unauthenticated client-quote pages can call it
GRANT EXECUTE ON FUNCTION public.submit_quote_application(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
