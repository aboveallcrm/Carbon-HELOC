# Verification Report

Verified on March 31, 2026 (America/Los_Angeles).

## Scope

This pass used the local application code, the added GHL/Bonzo reference skills, local browser/runtime checks, and direct requests to the deployed Supabase/Vercel endpoints.

Primary surfaces checked:

- Root static HELOC app in this repo
- Supabase-backed auth and public edge-function reachability
- CRM proxy/webhook endpoint reachability
- `heloc-app` React subproject

## Story Under Test

The main user story is:

`browser -> Vercel-hosted static app -> Supabase Auth / PostgREST / Edge Functions -> CRM integrations (Bonzo / GHL) -> response rendered back in the app`

## What I Verified Working

### Frontend

- Local Vercel runtime served the root app successfully at `http://localhost:4173/`.
- Unauthenticated access redirected correctly to `login.html`.
- `login.html` rendered correctly and showed the expected login controls.
- `register.html` rendered correctly and showed the expected registration controls.
- `reset-password.html` rendered correctly and handled an invalid/missing reset context with a visible fallback message.
- `client-quote.html` rendered correctly and showed a clear "Quote Not Found" state when no quote code was provided.

### Runtime config

- Local `api/public-config.js` returned valid runtime config when `SUPABASE_URL` and `SUPABASE_ANON_KEY` were present.
- Hosted `https://carbon-heloc-updated.vercel.app/api/public-config.js` returned valid runtime config and a `200 OK`.

### Backend reachability

- Supabase `profiles` table was reachable from the publishable client test script.
- Public/live edge functions were reachable and returned expected guardrail responses:
  - `get-prompt` -> `400 Missing required params: bot, category`
  - `redirect` -> `400 Missing slug`
  - `bonzo-proxy` -> `401 Missing authorization header`
  - `bonzo-webhook` -> `400 Missing user_id parameter`

### React subproject

- `heloc-app` `npm run lint` passed.
- `heloc-app` `npm run build` passed.
- `heloc-app` preview rendered its login screen successfully at `http://127.0.0.1:4174/`.

## Findings

### 1. Critical: signup is broken

Evidence:

- Browser registration attempt returned `Database error saving new user`.
- Direct Supabase signup test returned the same backend error.

Likely root cause:

- The current signup trigger writes to `public.subscriptions`, but this repo does not define a `subscriptions` table anywhere in the migrations I searched.

Relevant code:

- [supabase/migrations/20260326_upsert_lead_and_dedup_index.sql](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/supabase/migrations/20260326_upsert_lead_and_dedup_index.sql#L70)
- [supabase/migrations/20260326_upsert_lead_and_dedup_index.sql](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/supabase/migrations/20260326_upsert_lead_and_dedup_index.sql#L96)

Notes:

- A repo-wide search found `INSERT INTO public.subscriptions` in the trigger migration, but no matching `CREATE TABLE public.subscriptions` statement.
- The only similarly named table definition present in migrations is `push_subscriptions`, which is a different table.
- This is the first broken boundary in the authenticated user flow and blocks full in-app verification.

### 2. High: documented production hostname is stale

Evidence:

- `https://carbon-heloc.vercel.app/` returned `404 DEPLOYMENT_NOT_FOUND`.
- `https://carbon-heloc-updated.vercel.app/` returned `200 OK`.

Outdated references still point to the dead hostname:

- [docs/01-ARCHITECTURE.md](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/docs/01-ARCHITECTURE.md#L15)
- [docs/06-INTEGRATIONS.md](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/docs/06-INTEGRATIONS.md#L115)
- [AboveAllCarbon_HELOC_v12_FIXED.html](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/AboveAllCarbon_HELOC_v12_FIXED.html#L20)
- [robots.txt](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/robots.txt#L10)
- [sitemap.xml](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/sitemap.xml#L4)

Impact:

- Old links, canonical metadata, sitemap entries, and documentation can send users and crawlers to a dead deployment.

### 3. High: deployed `track-quote-view` behavior does not match repo code

Live behavior:

- `GET https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/track-quote-view` returned `405 Method Not Allowed`
- `POST https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/track-quote-view` returned `500 Internal server error`

Repo behavior suggests something else should happen:

- Local source explicitly supports `GET` fallback pixel responses and should return a guarded `400` when POST requests are missing `lead_id`/`user_id`, not a generic `500`.

Relevant code:

- [supabase/functions/track-quote-view/index.ts](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/supabase/functions/track-quote-view/index.ts#L41)
- [supabase/functions/track-quote-view/index.ts](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/supabase/functions/track-quote-view/index.ts#L105)
- [supabase/functions/track-quote-view/index.ts](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/supabase/functions/track-quote-view/index.ts#L108)
- [supabase/functions/track-quote-view/index.ts](/c:/Users/Eddie%20Omen/Documents/Above%20All%20HELOC%20Carbon/supabase/functions/track-quote-view/index.ts#L175)

Most likely explanation:

- The deployed function is stale, misconfigured, or not the same revision as the repo.

## Lower-Severity Observations

- `reset-password.html` triggered browser warnings about password fields not being inside a form. The page still rendered.
- The React preview login page triggered an autocomplete warning for the password field. The page still rendered.

## Blockers / Limits

- I could not inspect the linked Vercel project through the Vercel MCP tools because they returned `403 Forbidden`.
- I could not run the local Supabase stack because Docker was not available in this environment.
- I could not verify authenticated Bonzo/GHL flows end to end because signup is broken before a normal user session can be established.
- I could verify CRM endpoint reachability and guards, but not successful CRM transactions without a valid authenticated app session and configured live credentials.

## Recommended Next Steps

1. Fix the signup trigger path first.
2. Either create the missing `public.subscriptions` table or remove that insert from `handle_new_user`.
3. Redeploy the affected Supabase functions, especially `track-quote-view`.
4. Update all stale hostname references from `carbon-heloc.vercel.app` to the current production hostname.
5. Re-run verification after the auth fix so the authenticated app shell, cloud saves, and CRM actions can be tested end to end.
