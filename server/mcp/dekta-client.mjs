const DEFAULT_TIMEOUT_MS = 8_000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function cleanBaseUrl(value) {
  const url = new URL(String(value || ""));
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("DEKTA_MCP_BASE_URL must use http or https");
  if (url.username || url.password || url.search || url.hash) throw new Error("DEKTA_MCP_BASE_URL must not contain credentials, query, or fragment");
  return url.href.replace(/\/$/, "");
}

export function loadMcpConfig(environment = process.env) {
  const baseUrl = cleanBaseUrl(environment.DEKTA_MCP_BASE_URL || "http://127.0.0.1:4174");
  const sessionCookie = String(environment.DEKTA_MCP_SESSION_COOKIE || "").trim();
  const bearerToken = String(environment.DEKTA_MCP_BEARER_TOKEN || "").trim();
  if (sessionCookie && bearerToken) throw new Error("Configure only one DEKTA MCP credential mode");
  if (!sessionCookie && !bearerToken) throw new Error("DEKTA MCP requires DEKTA_MCP_SESSION_COOKIE or DEKTA_MCP_BEARER_TOKEN");
  if (sessionCookie && !LOOPBACK_HOSTS.has(new URL(baseUrl).hostname)) throw new Error("DEKTA MCP session cookies are restricted to loopback development; use the dedicated bearer integration credential");
  const timeoutMs = Number(environment.DEKTA_MCP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) throw new Error("DEKTA_MCP_TIMEOUT_MS must be 500-30000");
  return { baseUrl, sessionCookie, bearerToken, timeoutMs };
}

export class DektaClientError extends Error {
  constructor(code, status = 500, retryAfterSeconds = null) {
    super(code);
    this.name = "DektaClientError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createDektaClient(config, fetchImpl = fetch) {
  const headers = config.sessionCookie
    ? { cookie: config.sessionCookie }
    : { authorization: `Bearer ${config.bearerToken}` };

  async function get(path, { authenticated = true, operation = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}${path}`, {
        method: "GET",
        headers: authenticated ? { ...headers, ...(operation ? { "x-dekta-mcp-operation": operation } : {}) } : {},
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new DektaClientError(
        String(body.code || `HTTP_${response.status}`),
        response.status,
        Number(body.retryAfterSeconds || response.headers.get("retry-after")) || null
      );
      return body;
    } catch (error) {
      if (error instanceof DektaClientError) throw error;
      if (error?.name === "AbortError") throw new DektaClientError("DEKTA_TIMEOUT", 504);
      throw new DektaClientError("DEKTA_UNAVAILABLE", 503);
    } finally {
      clearTimeout(timer);
    }
  }

  async function command(commandName, payload, idempotencyKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const csrfToken = config.sessionCookie.match(/(?:^|;\s*)dekta_csrf=([^;]+)/)?.[1] || "";
    const commandHeaders = {
      ...headers,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      origin: config.baseUrl,
      ...(csrfToken ? { "x-csrf-token": decodeURIComponent(csrfToken) } : {})
    };
    try {
      const response = await fetchImpl(`${config.baseUrl}/api/v1/commands/${commandName}`, {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new DektaClientError(
        String(body.code || `HTTP_${response.status}`),
        response.status,
        Number(body.retryAfterSeconds || response.headers.get("retry-after")) || null
      );
      return body;
    } catch (error) {
      if (error instanceof DektaClientError) throw error;
      if (error?.name === "AbortError") throw new DektaClientError("DEKTA_TIMEOUT", 504);
      throw new DektaClientError("DEKTA_UNAVAILABLE", 503);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    health: () => get("/healthz", { authenticated: false }),
    readiness: () => get("/readyz", { authenticated: false }),
    summary: () => get("/api/v1/customer-to-cash/summary", { operation: "dekta_revenue_summary" }),
    snapshot: (operation = "dekta_snapshot") => get("/api/v1/customer-to-cash/snapshot", { operation }),
    command
  };
}
