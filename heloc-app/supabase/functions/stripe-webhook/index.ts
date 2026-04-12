import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify Stripe webhook signature
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );
    
    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return signature === expectedSig;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeWebhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return new Response(
      JSON.stringify({ error: 'Webhook secret not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature') || '';

    // Verify webhook signature
    const isValid = await verifyStripeSignature(payload, signature, stripeWebhookSecret);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const event = JSON.parse(payload);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Handle checkout completion
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata;

      if (metadata && metadata.package_id) {
        // This is a token purchase
        const userId = metadata.user_id;
        const baseTokens = parseInt(metadata.base_tokens) || 0;
        const bonusTokens = parseInt(metadata.bonus_tokens) || 0;
        const totalTokens = baseTokens + bonusTokens;

        // Credit tokens to user
        const { error: creditError } = await supabaseClient.rpc('credit_tokens', {
          p_user_id: userId,
          p_amount: totalTokens,
          p_type: 'purchase',
          p_description: `Purchased ${baseTokens.toLocaleString()} tokens${bonusTokens > 0 ? ` + ${bonusTokens.toLocaleString()} bonus` : ''}`,
          p_metadata: {
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent,
            base_tokens: baseTokens,
            bonus_tokens: bonusTokens,
            amount_paid: session.amount_total,
          },
        });

        if (creditError) {
          console.error('Error crediting tokens:', creditError);
          // Still return 200 to Stripe to prevent retries, but log the error
          // In production, you'd want to alert admin and handle this manually
        }

        console.log(`Credited ${totalTokens} tokens to user ${userId}`);
      }
    }

    // Handle subscription events (for future use)
    if (event.type === 'customer.subscription.created' || 
        event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      // Update user's subscription status in profiles
      // This would require storing stripe_customer_id in profiles
      console.log('Subscription event:', event.type, customerId);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
