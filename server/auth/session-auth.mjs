import { AUTH_COOKIE_NAMES } from "../application/auth-workspace-service.mjs";

export function parseCookies(value) {
  return Object.fromEntries(String(value || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [part, ""];
    const key = part.slice(0, index);
    const raw = part.slice(index + 1);
    try { return [key, decodeURIComponent(raw)]; }
    catch { return [key, raw]; }
  }));
}

export function credentialsFromRequest(request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  return { sessionToken: cookies[AUTH_COOKIE_NAMES.session] || "", csrfToken: cookies[AUTH_COOKIE_NAMES.csrf] || "" };
}

export function createSessionAuthAdapter({ service }) {
  if (!service?.authenticateToken) throw new Error("Session auth service is required");
  return async function authenticate(request) {
    const { sessionToken } = credentialsFromRequest(request);
    return service.authenticateToken(sessionToken);
  };
}
