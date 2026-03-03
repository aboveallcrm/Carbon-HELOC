/**
 * Stripe Integration
 * Expects Stripe.js to be loaded globally via <script src="https://js.stripe.com/v3/"></script>
 */

// TODO: REPLACE WITH YOUR STRIPE PUBLISHABLE KEY
const STRIPE_KEY = "pk_test_...";

let stripe = null;

export async function initStripe() {
    if (typeof Stripe === 'undefined') {
        console.error("Stripe.js not loaded.");
        return;
    }
    if (STRIPE_KEY.startsWith("pk_test_...")) {
        console.warn("Stripe Key not configured. Payments will be disabled.");
        return;
    }
    stripe = Stripe(STRIPE_KEY);
    console.log("Stripe initialized.");
}

export async function handleCheckout(priceId) {
    if (!stripe) {
        console.warn("Stripe not configured.");
        return;
    }

    try {
        // Create a checkout session on the backend OR use client-only checkout if applicable (rare).
        // Usually: Call your backend (Convex/Supabase/Node) to create a session session, then redirect.

        console.log("Initiating checkout for:", priceId);

        // MOCK for now since backend function is needed:
        console.warn("Stripe Checkout would launch here for price:", priceId);

        /* 
        const { error } = await stripe.redirectToCheckout({
            lineItems: [{ price: priceId, quantity: 1 }],
            mode: 'payment',
            successUrl: window.location.origin + '/success.html',
            cancelUrl: window.location.origin + '/cancel.html',
        });
        
        if (error) {
            console.error(error);
            console.error("Payment failed:", error.message);
        }
        */
    } catch (e) {
        console.error(e);
    }
}
