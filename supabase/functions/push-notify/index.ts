// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

// Web Push implementation using native crypto
// Based on VAPID protocol for web push notifications

interface PushSubscription {
    endpoint: string
    keys: {
        p256dh: string
        auth: string
    }
}

// Base64 URL-safe decoding
function base64UrlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - base64.length % 4) % 4)
    const binary = atob(base64 + padding)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

// Base64 URL-safe encoding
function base64UrlEncode(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer))
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Generate VAPID JWT
async function generateVapidJWT(vapidKeys: { publicKey: string, privateKey: string }, endpoint: string): Promise<string> {
    const origin = new URL(endpoint).origin
    const header = { typ: 'JWT', alg: 'ES256' }
    
    const now = Math.floor(Date.now() / 1000)
    const payload = {
        aud: origin,
        exp: now + 86400, // 24 hours
        sub: 'mailto:admin@aboveallcrm.com'
    }
    
    const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
    const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
    const signingInput = `${encodedHeader}.${encodedPayload}`
    
    // Sign with private key (simplified - real implementation needs proper ECDSA signing)
    // For production, use a proper web-push library or implement full ECDSA
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        await importVapidKey(vapidKeys.privateKey),
        new TextEncoder().encode(signingInput)
    )
    
    const encodedSignature = base64UrlEncode(signature)
    return `${signingInput}.${encodedSignature}`
}

// Import VAPID private key
async function importVapidKey(privateKeyBase64: string): Promise<CryptoKey> {
    // This is a simplified version - real implementation needs proper key import
    const keyData = base64UrlDecode(privateKeyBase64)
    return await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    )
}

// Send push notification
async function sendPushNotification(
    subscription: PushSubscription,
    payload: object,
    vapidKeys: { publicKey: string, privateKey: string }
): Promise<Response> {
    const endpoint = subscription.endpoint
    const vapidJWT = await generateVapidJWT(vapidKeys, endpoint)
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `vapid t=${vapidJWT}, k=${vapidKeys.publicKey}`,
        'TTL': '86400'
    }
    
    // Encrypt payload if keys provided
    let body: string | null = null
    if (subscription.keys && subscription.keys.p256dh && subscription.keys.auth) {
        body = await encryptPayload(payload, subscription.keys)
        headers['Content-Encoding'] = 'aes128gcm'
    } else {
        body = JSON.stringify(payload)
    }
    
    return fetch(endpoint, {
        method: 'POST',
        headers,
        body
    })
}

// Encrypt payload using AES-128-GCM
async function encryptPayload(payload: object, keys: { p256dh: string, auth: string }): Promise<string> {
    const encoder = new TextEncoder()
    const plaintext = encoder.encode(JSON.stringify(payload))
    
    // Decode subscription keys
    const clientPublicKey = base64UrlDecode(keys.p256dh)
    const authSecret = base64UrlDecode(keys.auth)
    
    // Generate ephemeral key pair
    const ephemeralKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveBits']
    )
    
    // Derive shared secret
    const clientKey = await crypto.subtle.importKey(
        'raw',
        clientPublicKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
    )
    
    const sharedSecret = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: clientKey },
        ephemeralKeyPair.privateKey,
        256
    )
    
    // HKDF key derivation (simplified)
    const prk = await crypto.subtle.importKey(
        'raw',
        new Uint8Array([...new Uint8Array(sharedSecret), ...authSecret]),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )
    
    // Generate salt
    const salt = crypto.getRandomValues(new Uint8Array(16))
    
    // Derive content encryption key
    const cekInfo = encoder.encode('Content-Encoding: aes128gcm\x00')
    const cek = await crypto.subtle.sign('HMAC', prk, new Uint8Array([...salt, ...cekInfo]))
    
    // Derive nonce
    const nonceInfo = encoder.encode('Content-Encoding: nonce\x00')
    const nonce = await crypto.subtle.sign('HMAC', prk, new Uint8Array([...salt, ...nonceInfo]))
    
    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: new Uint8Array(nonce).slice(0, 12) },
        await crypto.subtle.importKey(
            'raw',
            new Uint8Array(cek).slice(0, 16),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        ),
        plaintext
    )
    
    // Build final payload
    const ephemeralPublicKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey)
    const result = new Uint8Array(1 + 16 + 4 + new Uint8Array(ephemeralPublicKey).length + new Uint8Array(encrypted).length)
    
    result[0] = 0 // Version
    result.set(salt, 1)
    result.set(new Uint8Array(4), 17) // Record size (simplified)
    result.set(new Uint8Array(ephemeralPublicKey), 21)
    result.set(new Uint8Array(encrypted), 21 + new Uint8Array(ephemeralPublicKey).length)
    
    return base64UrlEncode(result.buffer)
}

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        const { userId, title, body, data, type } = await req.json()

        if (!userId || !title) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get VAPID keys from environment
        const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

        if (!vapidPublicKey || !vapidPrivateKey) {
            console.error('VAPID keys not configured')
            return new Response(
                JSON.stringify({ error: 'Push notifications not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !authData.user) {
            return new Response(
                JSON.stringify({ error: 'Invalid or expired token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const requesterId = authData.user.id
        const { data: requesterProfile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', requesterId)
            .maybeSingle()

        const requesterRole = requesterProfile?.role || 'user'
        const canSendForOtherUsers = requesterRole === 'admin' || requesterRole === 'super_admin'
        if (requesterId !== userId && !canSendForOtherUsers) {
            return new Response(
                JSON.stringify({ error: 'Forbidden' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const safeTitle = String(title).trim().slice(0, 120)
        const safeBody = String(body || '').trim().slice(0, 300)

        // Get user's push subscriptions
        const { data: subscriptions, error: subError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(25)

        if (subError || !subscriptions || subscriptions.length === 0) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    message: 'No active push subscriptions found',
                    sent: 0 
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Prepare notification payload
        const notificationPayload = {
            title: safeTitle,
            body: safeBody,
            icon: './favicon-192x192.png',
            badge: './favicon-64x64.png',
            tag: type || 'default',
            requireInteraction: type === 'call_me_now',
            data: data || {},
            actions: type === 'call_me_now' ? [
                { action: 'call', title: '📞 Call Now' },
                { action: 'view', title: 'View Quote' }
            ] : [
                { action: 'view', title: 'View Details' }
            ],
            vibrate: [200, 100, 200],
            timestamp: Date.now()
        }

        // Send to all subscriptions
        const results = []
        for (const sub of subscriptions) {
            try {
                const subscription: PushSubscription = sub.subscription
                
                // Send actual push notification
                const pushResponse = await sendPushNotification(
                    subscription,
                    notificationPayload,
                    { publicKey: vapidPublicKey, privateKey: vapidPrivateKey }
                )

                if (pushResponse.ok) {
                    // Log successful notification
                    await supabaseAdmin
                        .from('push_notification_logs')
                        .insert({
                            user_id: userId,
                            subscription_id: sub.id,
                            notification_type: type || 'general',
                            title: safeTitle,
                            body: safeBody,
                            data: data,
                            status: 'delivered',
                            sent_at: new Date().toISOString(),
                            provider_response: { status: pushResponse.status }
                        })

                    results.push({ subscription: sub.id, status: 'delivered' })
                } else {
                    throw new Error(`Push failed: ${pushResponse.status}`)
                }

            } catch (pushError) {
                console.error('Push send error:', pushError)
                results.push({ subscription: sub.id, status: 'failed', error: pushError.message })
                
                // Log failed notification
                await supabaseAdmin
                    .from('push_notification_logs')
                    .insert({
                        user_id: userId,
                        subscription_id: sub.id,
                        notification_type: type || 'general',
                        title: safeTitle,
                        body: safeBody,
                        data: data,
                        status: 'failed',
                        provider_response: { error: pushError.message }
                    })
                
                // Mark subscription as inactive if it fails permanently
                if (pushError.message.includes('410') || pushError.message.includes('404')) {
                    await supabaseAdmin
                        .from('push_subscriptions')
                        .update({ is_active: false, updated_at: new Date().toISOString() })
                        .eq('id', sub.id)
                }
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                delivered: results.filter(r => r.status === 'delivered').length,
                failed: results.filter(r => r.status === 'failed').length,
                results: results
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Push notification error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
