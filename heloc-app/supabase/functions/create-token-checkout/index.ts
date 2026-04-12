import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { packageId, userId } = await req.json();

    if (!packageId || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: packageId, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Get token package details
    const { data: tokenPackage, error: packageError } = await supabaseClient
      .from('token_pricing')
      .select('*')
      .eq('id', packageId)
      .single();

    if (packageError || !tokenPackage) {
      return new Response(
        JSON.stringify({ error: 'Invalid token package' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tier for bonus calculation
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('tier, email')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate bonus based on tier
    const tierMultiplier = profile.tier === 'enterprise' ? 1.5 : 
                          profile.tier === 'pro' ? 1.1 : 1.0;
    const baseTokens = tokenPackage.token_amount;
    const bonusTokens = Math.floor(baseTokens * (tierMultiplier - 1));
    const totalTokens = baseTokens + bonusTokens;

    // Create Stripe checkout session
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const successUrl = `${req.headers.get('origin')}/settings?tab=billing&checkout=success`;
    const cancelUrl = `${req.headers.get('origin')}/settings?tab=billing&checkout=cancelled`;

    const sessionResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'client_reference_id': userId,
        'customer_email': profile.email || '',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `${tokenPackage.name} - ${totalTokens.toLocaleString()} Tokens`,
        'line_items[0][price_data][product_data][description]': `Base: ${baseTokens.toLocaleString()} tokens${bonusTokens > 0 ? ` + ${bonusTokens.toLocaleString()} ${profile.tier} bonus` : ''}`,
        'line_items[0][price_data][unit_amount]': tokenPackage.price_cents.toString(),
        'line_items[0][quantity]': '1',
        'metadata[package_id]': packageId,
        'metadata[user_id]': userId,
        'metadata[base_tokens]': baseTokens.toString(),
        'metadata[bonus_tokens]': bonusTokens.toString(),
        'metadata[tier]': profile.tier || 'starter',
      }),
    });

    const session = await sessionResponse.json();

    if (session.error) {
      console.error('Stripe error:', session.error);
      return new Response(
        JSON.stringify({ error: 'Failed to create checkout session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
