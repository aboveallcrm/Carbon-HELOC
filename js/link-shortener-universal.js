/*
 * Above All CRM - Universal Link Shortener
 * Drop this into any authenticated HTML tool to auto-shorten URLs via Supabase.
 */

const LINK_SHORTENER = (() => {
  const SB_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6emFidmZ6dXhocGRjb3dndmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjgwNTYsImV4cCI6MjA4NDc0NDA1Nn0.tFliE-x2Tz9ET3A38R4y7eSo6bUu-bYY47XkWeX1xHY';

  async function getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
    };

    try {
      const sb = window._supabase;
      if (sb?.auth?.getSession) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
      }
    } catch (_error) {
      // Let the caller handle the missing auth state.
    }

    return headers;
  }

  async function postRpc(path, payload) {
    const headers = await getHeaders();
    if (!headers.Authorization) {
      return { error: 'Authenticated session required' };
    }

    try {
      const res = await fetch(`${SB_URL}/rest/v1/rpc/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: data?.message || data?.error || 'Request failed' };
      }

      return { data };
    } catch (error) {
      return { error: error?.message || 'Request failed' };
    }
  }

  async function shorten(destinationUrl, opts = {}) {
    const result = await postRpc('create_short_link', {
      p_destination_url: destinationUrl,
      p_title: opts.title || 'Short Link',
      p_category: opts.category || 'general',
      p_custom_slug: opts.slug || null,
      p_user_id: opts.user_id || null,
      p_lead_id: opts.lead_id || null,
      p_utm_source: opts.utm_source || null,
      p_utm_medium: opts.utm_medium || null,
      p_utm_campaign: opts.utm_campaign || null
    });

    if (result.error) return { error: result.error };
    if (result.data?.[0]) {
      return {
        short_url: result.data[0].out_short_url,
        slug: result.data[0].out_slug,
        id: result.data[0].out_id,
        destination_url: result.data[0].out_destination_url
      };
    }

    return { error: 'No data returned' };
  }

  async function stats(slug) {
    const result = await postRpc('get_link_stats', { p_slug: slug });
    if (result.error) return null;
    return result.data?.[0] || null;
  }

  return { shorten, stats };
})();

const shortenUrl = LINK_SHORTENER.shorten;
const getLinkStats = LINK_SHORTENER.stats;
