# Above All Carbon HELOC — Documentation Index

**Platform**: Above All Carbon HELOC CRM + Quote Builder
**Version**: v12 (March 2026)
**Hosting**: `carbon-heloc.vercel.app`
**Backend**: Supabase (`czzabvfzuxhpdcowgvam`)

---

## Documents

| File | Contents |
|------|----------|
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | Tech stack, file structure, auth flow, RLS patterns, deployment |
| [02-DATABASE-SCHEMA.md](02-DATABASE-SCHEMA.md) | All 22+ tables with columns, all RPC functions |
| [03-EDGE-FUNCTIONS.md](03-EDGE-FUNCTIONS.md) | All 17 edge functions — purpose, auth, actions, request/response format |
| [04-FEATURES-AND-TABS.md](04-FEATURES-AND-TABS.md) | Every UI tab and feature in the main app |
| [05-TIER-AND-ROLE-ACCESS.md](05-TIER-AND-ROLE-ACCESS.md) | Full access control matrix (tiers + roles + gating implementation) |
| [06-INTEGRATIONS.md](06-INTEGRATIONS.md) | Bonzo, GHL, n8n, HeyGen, Gmail, Resend, Webhooks setup + usage |
| [07-EZRA-AI.md](07-EZRA-AI.md) | All 8 Ezra AI features, local KB, client-side Ezra |
| [08-CLIENT-QUOTE-PAGE.md](08-CLIENT-QUOTE-PAGE.md) | Public client quote page — all sections, presets, flows |
| [09-SUPER-ADMIN.md](09-SUPER-ADMIN.md) | Super admin tab — user management, impersonation, API key management |
| [10-DNC-AND-COMPLIANCE.md](10-DNC-AND-COMPLIANCE.md) | 3-layer DNC system, TCPA logging, consent vault, compliance checker |
| [11-INTEGRATION-HEALTH-MONITOR.md](11-INTEGRATION-HEALTH-MONITOR.md) | Automated testing for Supabase, n8n, Bonzo, GHL, automations |
| [12-MOBILE-OPTIMIZATION.md](12-MOBILE-OPTIMIZATION.md) | Responsive design, touch targets, PWA, mobile testing |

---

## Quick Reference

### Supabase
- **Project ID**: `czzabvfzuxhpdcowgvam`
- **URL**: `https://czzabvfzuxhpdcowgvam.supabase.co`
- **Super Admin UUID**: `795aea13-6aba-45f2-97d4-04576f684557`

### Critical Gotchas
1. DB column is `tier` NOT `current_tier` on profiles table
2. Never use `is_super_admin()` in profiles RLS policies — causes infinite recursion
3. Bonzo API base URL is `https://app.getbonzo.com/api/v3` (NOT `api.getbonzo.com`)
4. Bonzo API key priority: `apiKey2` (JWT) preferred over `apiKey` (Xcode)
5. `quotes` table has NO `client_name` column — all data in `quote_data` JSONB
6. Edge functions that handle their own auth must be deployed with `--no-verify-jwt`

### Tier Numbers
| Tier | Number |
|------|--------|
| carbon | 0 |
| titanium | 1 |
| platinum | 2 |
| obsidian | 3 |
| diamond | 4 |

### Key External Services
| Service | Account | Notes |
|---------|---------|-------|
| Bonzo | Bonzo app | `app.getbonzo.com/api/v3` |
| GHL | GoHighLevel | Location: `{YOUR_GHL_LOCATION_ID}` |
| n8n | `https://n8n.srv1290585.hstgr.cloud/` | Self-hosted |
| HeyGen | heygen.com | Diamond tier only |
| Resend | notifications.aboveallcrm.com | Verified domain |
| Google Sheets | Rate Center | Sheet `1AKNJF-oz7SmdyhyU960U3k80XBdV6V10L-EqR2PfcDo` |
| Vercel | carbon-heloc.vercel.app | Static hosting |
