-- =============================================================================
-- Backfill display names for inbound leads that landed with blank first_name
-- and last_name (rendered as "Unknown" in the leads UI and the "Most Engaged
-- Leads" widget).
--
-- This is a one-time cleanup for rows ingested BEFORE the bonzo-webhook
-- normalizer fix (commits c5c5cdc + d946fe6 on
-- claude/test-google-oauth-n8n-5bZK2).
--
-- Behavior mirrors the webhook's display-name fallback:
--   1. Try raw payload keys: firstName / first_name / fname / given_name,
--      plus nested .contact.* / .properties.* wrappers.
--   2. Split a combined `name` / `full_name` field on the first space.
--   3. Derive from email local-part (initcap, replace ._- with spaces).
--   4. Derive a formatted phone like "Lead (555) 123-4567".
--
-- Safety:
--   - Only updates rows where BOTH first_name AND last_name are blank.
--   - Re-runnable (idempotent) — the WHERE clause skips already-backfilled rows.
--   - NO outbound calls to Bonzo, GHL, or any external CRM — pure local SQL.
--   - Does NOT touch email, phone, metadata, status, or any other column.
--
-- How to use:
--   1. Run STEP 1 (count + preview) first to sanity-check scope.
--   2. Run STEP 2 to perform the actual UPDATE.
--   3. Re-run STEP 1 to confirm the residual nameless count dropped.
--
-- Run this in the Supabase SQL Editor (or psql against the production DB).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 (read-only): count affected rows and preview the derivation
-- -----------------------------------------------------------------------------

-- 1a. How many leads would be touched?
select count(*) as nameless_count
from public.leads
where coalesce(first_name, '') = ''
  and coalesce(last_name, '') = '';

-- 1b. Preview the first 25 derivations without changing anything.
with src as (
    select
        l.id,
        l.first_name as current_first_name,
        l.last_name  as current_last_name,
        l.email,
        l.phone,
        l.crm_source,
        l.metadata->'raw' as raw
    from public.leads l
    where coalesce(l.first_name, '') = ''
      and coalesce(l.last_name, '') = ''
),
combined as (
    select s.*,
        coalesce(
            nullif(s.raw->>'name', ''),
            nullif(s.raw->>'full_name', ''),
            nullif(s.raw->>'fullName', ''),
            nullif(s.raw->>'contact_name', ''),
            nullif(s.raw->>'display_name', ''),
            nullif(s.raw->'contact'->>'name', ''),
            nullif(s.raw->'contact'->>'full_name', ''),
            ''
        ) as combined_name
    from src s
),
digits as (
    select c.*,
        regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') as phone_digits
    from combined c
),
derived as (
    select d.id, d.current_first_name, d.current_last_name, d.email, d.phone, d.crm_source,
        -- First name: raw aliases → nested wrappers → first token of combined → email → phone
        coalesce(
            nullif(d.raw->>'firstName', ''),
            nullif(d.raw->>'first_name', ''),
            nullif(d.raw->>'fname', ''),
            nullif(d.raw->>'firstname', ''),
            nullif(d.raw->>'given_name', ''),
            nullif(d.raw->>'givenName', ''),
            nullif(d.raw->>'forename', ''),
            nullif(d.raw->'contact'->>'firstName', ''),
            nullif(d.raw->'contact'->>'first_name', ''),
            nullif(d.raw->'properties'->>'firstName', ''),
            nullif(d.raw->'properties'->>'first_name', ''),
            nullif(d.raw->'lead'->>'firstName', ''),
            nullif(d.raw->'lead'->>'first_name', ''),
            nullif(d.raw->'data'->>'firstName', ''),
            nullif(d.raw->'data'->>'first_name', ''),
            nullif(split_part(d.combined_name, ' ', 1), ''),
            case
                when coalesce(d.email, '') <> ''
                then nullif(
                    initcap(
                        regexp_replace(
                            regexp_replace(split_part(d.email, '@', 1), '[._-]+', ' ', 'g'),
                            '\d+$', '', 'g'
                        )
                    ),
                    ''
                )
            end,
            case
                when length(d.phone_digits) >= 10
                then 'Lead (' || substr(d.phone_digits, length(d.phone_digits) - 9, 3)
                  || ') '    || substr(d.phone_digits, length(d.phone_digits) - 6, 3)
                  || '-'     || substr(d.phone_digits, length(d.phone_digits) - 3, 4)
                when length(d.phone_digits) > 0
                then 'Lead ' || d.phone_digits
            end
        ) as derived_first_name,
        -- Last name: raw aliases → nested wrappers → everything after first space of combined
        coalesce(
            nullif(d.raw->>'lastName', ''),
            nullif(d.raw->>'last_name', ''),
            nullif(d.raw->>'lname', ''),
            nullif(d.raw->>'lastname', ''),
            nullif(d.raw->>'family_name', ''),
            nullif(d.raw->>'familyName', ''),
            nullif(d.raw->>'surname', ''),
            nullif(d.raw->'contact'->>'lastName', ''),
            nullif(d.raw->'contact'->>'last_name', ''),
            nullif(d.raw->'properties'->>'lastName', ''),
            nullif(d.raw->'properties'->>'last_name', ''),
            nullif(d.raw->'lead'->>'lastName', ''),
            nullif(d.raw->'lead'->>'last_name', ''),
            nullif(d.raw->'data'->>'lastName', ''),
            nullif(d.raw->'data'->>'last_name', ''),
            case
                when position(' ' in d.combined_name) > 0
                then nullif(trim(substr(d.combined_name, position(' ' in d.combined_name) + 1)), '')
            end
        ) as derived_last_name
    from digits d
)
select id, crm_source, email, phone, derived_first_name, derived_last_name
from derived
where derived_first_name is not null or derived_last_name is not null
limit 25;


-- -----------------------------------------------------------------------------
-- STEP 2 (write): backfill first_name / last_name
--
-- Runs the same derivation as the preview and writes it back. Only touches
-- rows where BOTH first_name and last_name are still blank, so it's safe to
-- re-run and safe against any row that was manually corrected since.
-- -----------------------------------------------------------------------------

with src as (
    select
        l.id,
        l.email,
        l.phone,
        l.metadata->'raw' as raw
    from public.leads l
    where coalesce(l.first_name, '') = ''
      and coalesce(l.last_name, '') = ''
),
combined as (
    select s.*,
        coalesce(
            nullif(s.raw->>'name', ''),
            nullif(s.raw->>'full_name', ''),
            nullif(s.raw->>'fullName', ''),
            nullif(s.raw->>'contact_name', ''),
            nullif(s.raw->>'display_name', ''),
            nullif(s.raw->'contact'->>'name', ''),
            nullif(s.raw->'contact'->>'full_name', ''),
            ''
        ) as combined_name
    from src s
),
digits as (
    select c.*,
        regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') as phone_digits
    from combined c
),
derived as (
    select d.id,
        coalesce(
            nullif(d.raw->>'firstName', ''),
            nullif(d.raw->>'first_name', ''),
            nullif(d.raw->>'fname', ''),
            nullif(d.raw->>'firstname', ''),
            nullif(d.raw->>'given_name', ''),
            nullif(d.raw->>'givenName', ''),
            nullif(d.raw->>'forename', ''),
            nullif(d.raw->'contact'->>'firstName', ''),
            nullif(d.raw->'contact'->>'first_name', ''),
            nullif(d.raw->'properties'->>'firstName', ''),
            nullif(d.raw->'properties'->>'first_name', ''),
            nullif(d.raw->'lead'->>'firstName', ''),
            nullif(d.raw->'lead'->>'first_name', ''),
            nullif(d.raw->'data'->>'firstName', ''),
            nullif(d.raw->'data'->>'first_name', ''),
            nullif(split_part(d.combined_name, ' ', 1), ''),
            case
                when coalesce(d.email, '') <> ''
                then nullif(
                    initcap(
                        regexp_replace(
                            regexp_replace(split_part(d.email, '@', 1), '[._-]+', ' ', 'g'),
                            '\d+$', '', 'g'
                        )
                    ),
                    ''
                )
            end,
            case
                when length(d.phone_digits) >= 10
                then 'Lead (' || substr(d.phone_digits, length(d.phone_digits) - 9, 3)
                  || ') '    || substr(d.phone_digits, length(d.phone_digits) - 6, 3)
                  || '-'     || substr(d.phone_digits, length(d.phone_digits) - 3, 4)
                when length(d.phone_digits) > 0
                then 'Lead ' || d.phone_digits
            end
        ) as new_first_name,
        coalesce(
            nullif(d.raw->>'lastName', ''),
            nullif(d.raw->>'last_name', ''),
            nullif(d.raw->>'lname', ''),
            nullif(d.raw->>'lastname', ''),
            nullif(d.raw->>'family_name', ''),
            nullif(d.raw->>'familyName', ''),
            nullif(d.raw->>'surname', ''),
            nullif(d.raw->'contact'->>'lastName', ''),
            nullif(d.raw->'contact'->>'last_name', ''),
            nullif(d.raw->'properties'->>'lastName', ''),
            nullif(d.raw->'properties'->>'last_name', ''),
            nullif(d.raw->'lead'->>'lastName', ''),
            nullif(d.raw->'lead'->>'last_name', ''),
            nullif(d.raw->'data'->>'lastName', ''),
            nullif(d.raw->'data'->>'last_name', ''),
            case
                when position(' ' in d.combined_name) > 0
                then nullif(trim(substr(d.combined_name, position(' ' in d.combined_name) + 1)), '')
            end
        ) as new_last_name
    from digits d
)
update public.leads l
set
    first_name = coalesce(nullif(d.new_first_name, ''), l.first_name),
    last_name  = coalesce(nullif(d.new_last_name, ''),  l.last_name)
from derived d
where l.id = d.id
  and coalesce(l.first_name, '') = ''
  and coalesce(l.last_name, '') = ''
  and (nullif(d.new_first_name, '') is not null or nullif(d.new_last_name, '') is not null);


-- -----------------------------------------------------------------------------
-- STEP 3 (optional verification): residual count after backfill
-- -----------------------------------------------------------------------------

select count(*) as residual_nameless_count
from public.leads
where coalesce(first_name, '') = ''
  and coalesce(last_name, '') = '';
