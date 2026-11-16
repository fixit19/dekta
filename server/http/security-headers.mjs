export const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
});

export function applySecurityHeaders(outgoing, { httpsOnly = false } = {}) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) outgoing.setHeader(name, value);
  // Bound to validated deployment configuration, never client proxy headers.
  if (httpsOnly) outgoing.setHeader("strict-transport-security", "max-age=86400");
}
