/**
 * Supabase Quote Adapter
 * Saves quotes to the Supabase quotes table using insert-then-update semantics.
 */
import { supabase, getCurrentUser } from './supabase-client.js';

let _currentQuoteId = null;

export function initDB() {
    // Supabase quote adapter initialized
}

export async function saveQuote(quoteData) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return { ok: false, reason: 'not_authenticated' };
        }

        if (_currentQuoteId) {
            const { error } = await supabase
                .from('quotes')
                .update({ quote_data: quoteData, status: 'draft' })
                .eq('id', _currentQuoteId)
                .eq('user_id', user.id);

            if (error) {
                if (error.message?.includes('updated_at') || error.message?.includes('trigger')) {
                    console.warn('Quote update trigger error (run missing columns migration):', error.message);
                    return { ok: false, reason: error.message };
                }

                console.warn('Quote update failed, will retry as insert:', error.message);
                _currentQuoteId = null;
                return { ok: false, reason: error.message };
            }
            return { ok: true };
        }

        const { data, error } = await supabase
            .from('quotes')
            .insert({ user_id: user.id, quote_data: quoteData, status: 'draft' })
            .select('id')
            .single();

        if (error) {
            console.error('Quote insert error:', error);
            return { ok: false, reason: error.message };
        }

        _currentQuoteId = data.id;
        return { ok: true };
    } catch (e) {
        console.error('Save failed:', e);
        return { ok: false, reason: e.message };
    }
}

export function resetQuoteId() {
    _currentQuoteId = null;
}

export function setQuoteId(id) {
    _currentQuoteId = id;
}
