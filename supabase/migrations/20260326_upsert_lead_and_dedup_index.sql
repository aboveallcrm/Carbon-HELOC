-- Migration: Unified leads dedup infrastructure
-- Date: 2026-03-26
-- Purpose: Single source of truth for all leads across all Above All CRM tools

-- 1. Drop existing version if return type changed
DROP FUNCTION IF EXISTS upsert_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

-- 2. Create upsert_lead() RPC — 3-layer dedup (email → phone → CRM ID)
CREATE OR REPLACE FUNCTION upsert_lead(
  p_user_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'manual',
  p_status TEXT DEFAULT 'new',
  p_crm_contact_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(lead_id UUID, is_new BOOLEAN) AS $$
DECLARE
  v_existing UUID;
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_phone_digits TEXT := REGEXP_REPLACE(COALESCE(p_phone,''), '\D', '', 'g');
BEGIN
  IF v_email != '' THEN
    SELECT id INTO v_existing FROM leads
    WHERE user_id = p_user_id AND LOWER(TRIM(email)) = v_email AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_existing IS NULL AND LENGTH(v_phone_digits) >= 7 THEN
    SELECT id INTO v_existing FROM leads
    WHERE user_id = p_user_id AND deleted_at IS NULL
    AND REGEXP_REPLACE(COALESCE(phone,''), '\D', '', 'g') = v_phone_digits
    LIMIT 1;
  END IF;

  IF v_existing IS NULL AND p_crm_contact_id IS NOT NULL AND p_crm_contact_id != '' THEN
    SELECT id INTO v_existing FROM leads
    WHERE user_id = p_user_id AND crm_contact_id = p_crm_contact_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE leads SET
      first_name = COALESCE(NULLIF(leads.first_name,''), p_first_name, leads.first_name),
      last_name = COALESCE(NULLIF(leads.last_name,''), p_last_name, leads.last_name),
      email = COALESCE(NULLIF(leads.email,''), p_email, leads.email),
      phone = COALESCE(NULLIF(leads.phone,''), p_phone, leads.phone),
      crm_contact_id = COALESCE(leads.crm_contact_id, p_crm_contact_id),
      metadata = leads.metadata || p_metadata,
      updated_at = NOW()
    WHERE leads.id = v_existing;
    RETURN QUERY SELECT v_existing, false;
  ELSE
    RETURN QUERY
    INSERT INTO leads (user_id, first_name, last_name, email, phone, source, crm_source, crm_contact_id, status, metadata, created_at, updated_at)
    VALUES (p_user_id, p_first_name, p_last_name, p_email, p_phone, p_source, p_source, p_crm_contact_id, p_status, p_metadata, NOW(), NOW())
    RETURNING id, true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Unique partial index — prevents duplicate emails per user at DB level
CREATE UNIQUE INDEX IF NOT EXISTS leads_user_email_unique
ON leads (user_id, LOWER(TRIM(email)))
WHERE email IS NOT NULL AND email != '' AND deleted_at IS NULL;

-- 4. Fix default role for new signups (was 'lo', now 'user')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_end timestamptz := now() + interval '14 days';
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, tier, role, subscription_status, trial_ends_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'carbon',
    CASE
      WHEN NEW.email IN ('barraganmortgage@gmail.com', 'eddieb@wclloans.com') THEN 'super_admin'
      ELSE 'user'
    END,
    'trialing',
    v_trial_end
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (
    user_id, tier, status, trial_ends_at, created_at, updated_at
  )
  VALUES (
    NEW.id, 'carbon', 'trialing', v_trial_end, now(), now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
