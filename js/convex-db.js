/**
 * Database Adapter (Supabase)
 * Saves quotes to the Supabase quotes table.
 * Uses insert-then-update pattern to avoid creating a new row on every save.
 */
import { supabase, getCurrentUser } from './supabase-client.js';

let _currentQuoteId = null;

export function initConvex() {
    console.log("Supabase DB adapter initialized.");
}

export async function saveQuoteToConvex(quoteData) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            console.warn("User not logged in, cannot save quote.");
            return { ok: false, reason: 'not_authenticated' };
        }

        if (_currentQuoteId) {
            // Update existing quote row
            const { error } = await supabase
                .from('quotes')
                .update({ quote_data: quoteData, status: 'draft' })
                .eq('id', _currentQuoteId);

            if (error) {
                console.error("Supabase update error:", error);
                // If the row was deleted, reset and insert fresh
                if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
                    _currentQuoteId = null;
                    return saveQuoteToConvex(quoteData);
                }
                return { ok: false, reason: error.message };
            }
            return { ok: true };
        } else {
            // Insert new quote, capture the ID for future updates
            const { data, error } = await supabase
                .from('quotes')
                .insert({ user_id: user.id, quote_data: quoteData, status: 'draft' })
                .select('id')
                .single();

            if (error) {
                console.error("Supabase insert error:", error);
                return { ok: false, reason: error.message };
            }
            _currentQuoteId = data.id;
            return { ok: true };
        }
    } catch (e) {
        console.error("Save failed:", e);
        return { ok: false, reason: e.message };
    }
}

export function resetQuoteId() {
    _currentQuoteId = null;
}

export function setQuoteId(id) {
    _currentQuoteId = id;
}
