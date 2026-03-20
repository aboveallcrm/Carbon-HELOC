const ALLOWED_ORIGINS = [
  "https://carbon-heloc.vercel.app",
  "https://carbon-heloc-updated.vercel.app",
  "https://aboveallcrm.com",
  "https://www.aboveallcrm.com",
  "https://heloc.aboveallcrm.com",
];

const ALLOWED_LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    return ALLOWED_LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

/** Wildcard CORS for webhook/redirect endpoints that accept external requests */
export function getWebhookCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
