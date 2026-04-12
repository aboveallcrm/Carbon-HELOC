// Dual-mode: Vercel serverless function (CommonJS) + browser static fallback for local dev.
// In production on Vercel, the handler below runs and returns JS that sets window.__PUBLIC_CONFIG__.
// In local dev (python -m http.server), the file is served raw — the IIFE below sets window.__PUBLIC_CONFIG__
// directly for the browser, and the module.exports tail is wrapped in a typeof guard so it doesn't throw.

(function () {
  if (typeof window !== 'undefined' && !window.__PUBLIC_CONFIG__) {
    // Local dev fallback — values from project CLAUDE.md memory.
    // Do NOT commit changes to these values; on Vercel the handler below generates the config from env vars.
    window.__PUBLIC_CONFIG__ = Object.freeze({
      supabaseUrl: 'https://czzabvfzuxhpdcowgvam.supabase.co',
      supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6emFidmZ6dXhocGRjb3dndmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjgwNTYsImV4cCI6MjA4NDc0NDA1Nn0.tFliE-x2Tz9ET3A38R4y7eSo6bUu-bYY47XkWeX1xHY',
      supabaseFunctionsUrl: 'https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1'
    });
  }
})();

// ===== Vercel serverless handler (runs only in Node/Vercel, not in browser) =====
function buildConfigScript() {
  // TODO: Confirm SUPABASE_URL and SUPABASE_ANON_KEY are set in the Vercel project env before launch.
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      statusCode: 500,
      body: "window.__PUBLIC_CONFIG__ = Object.freeze({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in Vercel environment variables.' });",
    };
  }

  const payload = {
    supabaseUrl,
    supabaseAnonKey,
    supabaseFunctionsUrl: `${supabaseUrl.replace(/\/$/, '')}/functions/v1`,
  };

  return {
    statusCode: 200,
    body: `window.__PUBLIC_CONFIG__ = Object.freeze(${JSON.stringify(payload)});`,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = function handler(req, res) {
    try {
      const result = buildConfigScript();
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.statusCode = result.statusCode;
      res.end(result.body);
    } catch (error) {
      console.error('[public-config] Failed to build runtime config', error);
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.statusCode = 500;
      res.end(
        "window.__PUBLIC_CONFIG__ = Object.freeze({ error: 'Public config endpoint failed. Check Vercel function logs.' });"
      );
    }
  };
}
