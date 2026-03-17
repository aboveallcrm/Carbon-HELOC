// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

import { getCorsHeaders } from "../_shared/cors.ts"

/** Exchange authorization code for tokens (first-time connect) */
async function exchangeCode(code: string, redirectUri: string, clientId: string, clientSecret: string) {
    const resp = await fetch(GMAIL_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    })
    if (!resp.ok) {
        const err = await resp.text()
        throw new Error('Token exchange failed: ' + err)
    }
    return resp.json()
}

/** Refresh access token using stored refresh token */
async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
    const resp = await fetch(GMAIL_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
        }),
    })
    if (!resp.ok) {
        const err = await resp.text()
        throw new Error('Token refresh failed: ' + err)
    }
    return resp.json()
}

/** Encode email as RFC 2822 base64url string for Gmail API */
function buildRawEmail(to: string, subject: string, htmlBody: string, fromName: string, fromEmail: string): string {
    const boundary = 'boundary_' + Math.random().toString(36).slice(2)
    const headers = [
        `From: ${fromName ? `"${fromName}" <${fromEmail}>` : fromEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join('\r\n')

    const plainText = htmlBody.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

    const body = [
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        ``,
        plainText,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset="UTF-8"`,
        ``,
        htmlBody,
        ``,
        `--${boundary}--`,
    ].join('\r\n')

    const raw = headers + '\r\n\r\n' + body
    // base64url encode
    return btoa(unescape(encodeURIComponent(raw)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    function jsonResponse(body: any, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    try {
        // Authenticate caller via Supabase JWT
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) return jsonResponse({ error: 'Invalid or expired token' }, 401)

        const userId = user.id
        const body = await req.json()
        const { action } = body

        // Google OAuth client credentials from env vars
        const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
        const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            return jsonResponse({ error: 'Google OAuth client not configured on server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.' }, 500)
        }

        // ── ACTION: exchange_code ─────────────────────────────────────────────
        // Called after user completes OAuth consent flow; stores refresh token
        if (action === 'exchange_code') {
            const { code, redirectUri } = body
            if (!code || !redirectUri) return jsonResponse({ error: 'Missing code or redirectUri' }, 400)

            const tokens = await exchangeCode(code, redirectUri, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)

            if (!tokens.refresh_token) {
                return jsonResponse({
                    error: 'No refresh token returned. Make sure prompt=consent&access_type=offline in your OAuth URL, and revoke the existing app grant in Google Account settings then try again.'
                }, 400)
            }

            // Get Gmail address from token info
            let gmailEmail = ''
            try {
                const infoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: 'Bearer ' + tokens.access_token }
                })
                const info = await infoResp.json()
                gmailEmail = info.email || ''
            } catch (_) { /* non-critical */ }

            // Store refresh token in user_integrations
            const gmailOAuth = {
                refresh_token: tokens.refresh_token,
                connected_email: gmailEmail,
                connected_at: new Date().toISOString(),
            }

            const { data: existing } = await supabaseAdmin
                .from('user_integrations')
                .select('id, metadata')
                .eq('user_id', userId)
                .eq('provider', 'heloc_settings')
                .maybeSingle()

            const meta = existing?.metadata || {}
            meta.gmail_oauth = gmailOAuth

            if (existing) {
                await supabaseAdmin.from('user_integrations')
                    .update({ metadata: meta, updated_at: new Date().toISOString() })
                    .eq('id', existing.id)
            } else {
                await supabaseAdmin.from('user_integrations')
                    .insert({ user_id: userId, provider: 'heloc_settings', metadata: meta })
            }

            return jsonResponse({ success: true, connected_email: gmailEmail })
        }

        // ── ACTION: send ──────────────────────────────────────────────────────
        // Sends email via Gmail API using stored refresh token
        if (action === 'send') {
            const { to, subject, html, fromName, fromEmail } = body
            if (!to || !subject || !html) return jsonResponse({ error: 'Missing to, subject, or html' }, 400)

            // Load refresh token from DB — check both storage locations:
            // 1. heloc_settings → metadata.gmail_oauth (manual Integrations tab connect)
            // 2. google_oauth → metadata.refresh_token (auto-captured from Google login)
            const { data: settingsRow } = await supabaseAdmin
                .from('user_integrations')
                .select('metadata')
                .eq('user_id', userId)
                .eq('provider', 'heloc_settings')
                .maybeSingle()

            let refreshToken = settingsRow?.metadata?.gmail_oauth?.refresh_token

            // Fallback: check google_oauth provider (set when user logs in with Google)
            if (!refreshToken) {
                const { data: googleRow } = await supabaseAdmin
                    .from('user_integrations')
                    .select('api_key, metadata')
                    .eq('user_id', userId)
                    .eq('provider', 'google_oauth')
                    .maybeSingle()

                refreshToken = googleRow?.metadata?.refresh_token || null

                // If we found a token from Google login, migrate it to heloc_settings for future use
                if (refreshToken) {
                    const meta = settingsRow?.metadata || {}
                    meta.gmail_oauth = {
                        refresh_token: refreshToken,
                        connected_email: user.email || '',
                        connected_at: googleRow?.metadata?.captured_at || new Date().toISOString(),
                        source: 'google_login',
                    }
                    if (settingsRow) {
                        await supabaseAdmin.from('user_integrations')
                            .update({ metadata: meta, updated_at: new Date().toISOString() })
                            .eq('user_id', userId)
                            .eq('provider', 'heloc_settings')
                    } else {
                        await supabaseAdmin.from('user_integrations')
                            .insert({ user_id: userId, provider: 'heloc_settings', metadata: meta })
                    }
                }
            }

            if (!refreshToken) {
                return jsonResponse({ error: 'Gmail not connected. Sign in with Google or connect Gmail in Settings → Integrations.' }, 400)
            }

            // Get fresh access token
            const tokens = await refreshAccessToken(refreshToken, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
            const accessToken = tokens.access_token

            // Build and send email
            const raw = buildRawEmail(to, subject, html, fromName || '', fromEmail || user.email || '')

            const sendResp = await fetch(GMAIL_SEND_URL, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ raw }),
            })

            if (!sendResp.ok) {
                const errBody = await sendResp.json().catch(() => ({}))
                return jsonResponse({ error: 'Gmail API error: ' + (errBody?.error?.message || sendResp.status) }, 502)
            }

            const result = await sendResp.json()
            return jsonResponse({ success: true, messageId: result.id })
        }

        // ── ACTION: disconnect ────────────────────────────────────────────────
        if (action === 'disconnect') {
            const { data: settingsRow } = await supabaseAdmin
                .from('user_integrations')
                .select('id, metadata')
                .eq('user_id', userId)
                .eq('provider', 'heloc_settings')
                .maybeSingle()

            if (settingsRow) {
                const meta = settingsRow.metadata || {}
                delete meta.gmail_oauth
                await supabaseAdmin.from('user_integrations')
                    .update({ metadata: meta, updated_at: new Date().toISOString() })
                    .eq('id', settingsRow.id)
            }
            return jsonResponse({ success: true })
        }

        // ── ACTION: status ────────────────────────────────────────────────────
        if (action === 'status') {
            const { data: settingsRow } = await supabaseAdmin
                .from('user_integrations')
                .select('metadata')
                .eq('user_id', userId)
                .eq('provider', 'heloc_settings')
                .maybeSingle()

            const gmailOAuth = settingsRow?.metadata?.gmail_oauth

            // Also check google_oauth provider (auto-captured from Google login)
            if (!gmailOAuth?.refresh_token) {
                const { data: googleRow } = await supabaseAdmin
                    .from('user_integrations')
                    .select('metadata')
                    .eq('user_id', userId)
                    .eq('provider', 'google_oauth')
                    .maybeSingle()

                if (googleRow?.metadata?.refresh_token) {
                    return jsonResponse({
                        connected: true,
                        connected_email: user.email || '',
                        connected_at: googleRow?.metadata?.captured_at || null,
                        source: 'google_login',
                    })
                }
            }

            return jsonResponse({
                connected: !!(gmailOAuth?.refresh_token),
                connected_email: gmailOAuth?.connected_email || '',
                connected_at: gmailOAuth?.connected_at || null,
            })
        }

        return jsonResponse({ error: 'Unknown action: ' + action }, 400)

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('gmail-send error:', message)
        return jsonResponse({ error: message }, 500)
    }
})
