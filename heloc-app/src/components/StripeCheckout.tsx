import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_KEY || 'pk_test_placeholder');

const CheckoutForm = ({ onSuccess }: { onSuccess: () => void }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState('');
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!stripe || !elements) return;

        setProcessing(true);
        const cardElement = elements.getElement(CardElement);

        if (cardElement) {
            const { error, paymentMethod } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
            });

            if (error) {
                setError(error.message || 'Payment failed');
                setProcessing(false);
            } else {
                console.log('[PaymentMethod]', paymentMethod);
                // Here you would call your backend (Convex) to confirm payment
                onSuccess();
                setProcessing(false);
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-white rounded border border-gray-200">
            <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Card Details</label>
                <div className="p-3 border rounded bg-gray-50">
                    <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
                </div>
            </div>
            {error && <div className="text-red-500 text-xs mb-2">{error}</div>}
            <button
                type="submit"
                disabled={!stripe || processing}
                className="w-full bg-green-600 text-white font-bold py-2 rounded uppercase text-sm hover:bg-green-700 disabled:opacity-50"
            >
                {processing ? 'Processing...' : 'Pay Now'}
            </button>
        </form>
    );
};

export const StripeCheckoutModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-md w-full relative">
                <button className="absolute top-2 right-2 text-gray-500 hover:text-gray-800" onClick={onClose}>✕</button>
                <h2 className="text-xl font-bold text-gray-800 mb-4 uppercase text-center">Secure Checkout</h2>
                <Elements stripe={stripePromise}>
                    <CheckoutForm onSuccess={() => { alert('Payment Successful!'); onClose(); }} />
                </Elements>
            </div>
        </div>
    );
};
