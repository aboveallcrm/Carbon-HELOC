module.exports = function handler(req, res) {
  // TODO: Confirm SUPABASE_URL and SUPABASE_ANON_KEY are set in the Vercel project env before launch.
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!supabaseUrl || !supabaseAnonKey) {
    res.statusCode = 500;
    res.end(
      "window.__PUBLIC_CONFIG__ = Object.freeze({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in Vercel environment variables.' });"
    );
    return;
  }

  const payload = {
    supabaseUrl,
    supabaseAnonKey,
    supabaseFunctionsUrl: `${supabaseUrl.replace(/\\/$/, '')}/functions/v1`,
  };

  res.statusCode = 200;
  res.end(`window.__PUBLIC_CONFIG__ = Object.freeze(${JSON.stringify(payload)});`);
};
