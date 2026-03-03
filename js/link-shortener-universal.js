/*
 * Above All CRM — Universal Link Shortener
 * Drop this into any HTML tool to auto-shorten URLs via Supabase
 * 
 * Usage:
 *   const result = await shortenUrl('https://long-url.com/quote/abc123', {
 *     title: 'Quote for John Smith',
 *     category: 'quotes',
 *     utm_source: 'sms',
 *     utm_medium: 'erika-bot',
 *     utm_campaign: 'heloc-outreach'
 *   });
 *   console.log(result.short_url); // https://go.aboveallcrm.com/a3kf9x
 */

const LINK_SHORTENER = (() => {
  const SB_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6emFidmZ6dXhocGRjb3dndmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjgwNTYsImV4cCI6MjA4NDc0NDA1Nn0.tFliE-x2Tz9ET3A38R4y7eSo6bUu-bYY47XkWeX1xHY';
  
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`
  };

  /**
   * Create a branded short link
   * @param {string} destinationUrl - The long URL to shorten
   * @param {Object} opts - Options
   * @param {string} opts.title - Display title for the link
   * @param {string} opts.category - quotes|campaigns|heloc|refi|dscr|tools|general
   * @param {string} opts.slug - Custom slug (optional, auto-generates if empty)
   * @param {string} opts.utm_source - UTM source tag
   * @param {string} opts.utm_medium - UTM medium tag  
   * @param {string} opts.utm_campaign - UTM campaign tag
   * @param {string} opts.lead_id - UUID of associated lead (optional)
   * @returns {Object} { short_url, slug, id, destination_url } or { error }
   */
  async function shorten(destinationUrl, opts = {}) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/rpc/create_short_link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_destination_url: destinationUrl,
          p_title: opts.title || 'Short Link',
          p_category: opts.category || 'general',
          p_custom_slug: opts.slug || null,
          p_user_id: opts.user_id || null,
          p_lead_id: opts.lead_id || null,
          p_utm_source: opts.utm_source || null,
          p_utm_medium: opts.utm_medium || null,
          p_utm_campaign: opts.utm_campaign || null
        })
      });
      const data = await res.json();
      if (data?.[0]) {
        return {
          short_url: data[0].out_short_url,
          slug: data[0].out_slug,
          id: data[0].out_id,
          destination_url: data[0].out_destination_url
        };
      }
      return { error: 'No data returned' };
    } catch (e) {
      console.error('Link shortener error:', e);
      return { error: e.message };
    }
  }

  /**
   * Get click stats for a link
   * @param {string} slug - The link slug
   * @returns {Object} { total_clicks, unique_devices, last_click, top_device, top_city }
   */
  async function stats(slug) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/rpc/get_link_stats`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_slug: slug })
      });
      const data = await res.json();
      return data?.[0] || null;
    } catch (e) {
      return null;
    }
  }

  return { shorten, stats };
})();

// ─── CONVENIENCE ALIASES ───
const shortenUrl = LINK_SHORTENER.shorten;
const getLinkStats = LINK_SHORTENER.stats;


/* ─── INTEGRATION EXAMPLES ───

// 1. QUOTE TOOL — auto-shorten after generating quote
async function generateQuote(quoteData) {
  const quoteUrl = `https://elite.aboveallcrm.com/api/quotes/view/${quoteData.hash}`;
  const link = await shortenUrl(quoteUrl, {
    title: `Quote for ${quoteData.borrowerName}`,
    category: 'quotes',
    utm_source: 'quote-tool',
    utm_medium: 'direct',
    utm_campaign: quoteData.loanType
  });
  
  // Show the short link instead of the long one
  document.getElementById('shareLink').value = link.short_url;
  document.getElementById('smsMessage').value = 
    `Here's your personalized ${quoteData.loanType} quote:\n${link.short_url}\n\n— Eddie Barragan | West Capital Lending\nNMLS# 1828140`;
}

// 2. BOT (n8n) — shorten links before sending SMS
// In your n8n HTTP Request node, POST to:
// https://czzabvfzuxhpdcowgvam.supabase.co/rest/v1/rpc/create_short_link
// Body: {"p_destination_url":"{{$json.quoteUrl}}","p_title":"Quote for {{$json.contactName}}","p_category":"quotes","p_utm_source":"sms","p_utm_medium":"erika-bot"}
// Then use {{ $json[0].out_short_url }} in your SMS message

// 3. CAMPAIGN GENERATOR — shorten campaign landing page
async function createCampaignLink(campaignUrl, campaignName) {
  return await shortenUrl(campaignUrl, {
    title: campaignName,
    category: 'campaigns',
    utm_source: 'campaign',
    utm_medium: 'email',
    utm_campaign: campaignName.toLowerCase().replace(/\s+/g, '-')
  });
}

*/
