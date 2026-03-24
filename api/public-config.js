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
