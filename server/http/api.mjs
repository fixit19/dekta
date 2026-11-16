const MAX_JSON_BYTES = 64 * 1024;

function json(status, body, { cookies = [], headers: extraHeaders = {} } = {}) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(JSON.stringify(body), { status, headers });
}

function statusFor(code) {
  if (code === "AUTHENTICATION_REQUIRED") return 401;
  if (["LOGIN_RATE_LIMITED", "INTEGRATION_RATE_LIMITED"].includes(code)) return 429;
  if (["LOGIN_DELIVERY_FAILED", "INVITATION_DELIVERY_FAILED"].includes(code)) return 503;
  if (["TENANT_MEMBERSHIP_REQUIRED", "ACTION_FORBIDDEN", "INTEGRATION_COMMAND_FORBIDDEN", "FEATURE_NOT_ENTITLED", "SUBSCRIPTION_INACTIVE", "TRIAL_EXPIRED", "GRACE_EXPIRED", "CSRF_INVALID", "INVITATION_EMAIL_MISMATCH"].includes(code)) return 403;
  if (code?.endsWith("_NOT_FOUND")) return 404;
  if (["ACCOUNT_DUPLICATE", "CONTRACT_NUMBER_DUPLICATE", "INVOICE_NUMBER_DUPLICATE", "PAYMENT_EVIDENCE_DUPLICATE", "COMMAND_RETRYABLE_CONFLICT", "PAYMENT_EXCEEDS_OUTSTANDING", "OPPORTUNITY_NOT_ACTIVE", "IDEMPOTENCY_KEY_REUSED", "CONSULTING_ENGAGEMENT_REFERENCE_DUPLICATE", "CONSULTING_WORKSTREAM_DUPLICATE", "CONSULTING_HANDOFF_PENDING", "CONSULTING_HANDOFF_ALREADY_REVIEWED", "CONSULTING_EXPENSE_ALREADY_REVIEWED", "CONSULTING_EXPENSE_EVIDENCE_DUPLICATE", "WORKSPACE_ALREADY_SELECTED", "INVITATION_ALREADY_PENDING", "MEMBER_ALREADY_ACTIVE"].includes(code) || code?.endsWith("_VERSION_CONFLICT")) return 409;
  return 422;
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_JSON_BYTES) return { ok: false, response: json(413, { ok: false, code: "PAYLOAD_TOO_LARGE" }) };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) return { ok: false, response: json(413, { ok: false, code: "PAYLOAD_TOO_LARGE" }) };
  try {
    const value = text ? JSON.parse(text) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, response: json(400, { ok: false, code: "JSON_OBJECT_REQUIRED" }) };
    return { ok: true, value };
  }
  catch { return { ok: false, response: json(400, { ok: false, code: "INVALID_JSON" }) }; }
}

const MCP_SNAPSHOT_OPERATIONS = new Set([
  "dekta_list_opportunities",
  "dekta_list_followups",
  "dekta_account_context"
]);

function mcpSnapshotOperation(request) {
  const declared = request.headers.get("x-dekta-mcp-operation") || "";
  return MCP_SNAPSHOT_OPERATIONS.has(declared) ? declared : "dekta_snapshot";
}

export function createApiHandler({ service, authenticate, identity = null, integrationControl = null, ready = async () => true, logger = null }) {
  if (!service || !authenticate) throw new Error("service and authenticate are required");
  return async function handle(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/healthz") return json(200, { ok: true, service: "dekta-api" });
    if (request.method === "GET" && url.pathname === "/readyz") {
      try { return (await ready()) ? json(200, { ok: true, ready: true }) : json(503, { ok: false, ready: false }); }
      catch { return json(503, { ok: false, ready: false }); }
    }
    if (identity && request.method === "POST" && ["/api/v1/auth/email/request-code", "/api/v1/auth/email/verify-code"].includes(url.pathname)) {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json(415, { ok: false, code: "JSON_CONTENT_TYPE_REQUIRED" });
      const parsed = await readJson(request);
      if (!parsed.ok) return parsed.response;
      const result = url.pathname.endsWith("request-code")
        ? await identity.requestEmailCode(parsed.value)
        : await identity.verifyEmailCode(parsed.value);
      if (result.code === "LOGIN_RATE_LIMITED") logger?.({
        level: "warn",
        event: "auth_rate_limited",
        requestId: request.headers.get("x-request-id") || null,
        path: url.pathname
      });
      return json(result.ok ? 200 : statusFor(result.code), { ...result, setCookies: undefined, setCookie: undefined }, {
        cookies: result.setCookies || [],
        headers: result.retryAfterSeconds ? { "retry-after": String(result.retryAfterSeconds) } : {}
      });
    }

    const auth = await authenticate(request);
    const credentials = identity?.credentialsFromRequest?.(request) || { sessionToken: "", csrfToken: "" };
    if (identity && request.method === "GET" && url.pathname === "/api/v1/auth/session") {
      return json(200, identity.sessionView(auth, credentials.csrfToken));
    }
    if (!auth) return json(401, { ok: false, code: "AUTHENTICATION_REQUIRED" });
    const csrfHeader = request.headers.get("x-csrf-token") || "";
    const csrfValid = auth.credentialType === "integration" || !identity || (csrfHeader === credentials.csrfToken && identity.csrfValid(auth, csrfHeader));

    async function reserveIntegration(operation) {
      if (auth.credentialType !== "integration" || !integrationControl) return { ok: true, invocationId: null };
      const reservation = await integrationControl.reserve({
        auth,
        operation,
        method: request.method,
        requestId: request.headers.get("x-request-id")
      });
      if (reservation.ok) return reservation;
      logger?.({
        level: "warn",
        event: "mcp_rate_limited",
        requestId: request.headers.get("x-request-id") || null,
        operation
      });
      return {
        ...reservation,
        response: json(429, { ok: false, code: "INTEGRATION_RATE_LIMITED", retryAfterSeconds: reservation.retryAfterSeconds }, {
          headers: { "retry-after": String(reservation.retryAfterSeconds) }
        })
      };
    }

    async function completeIntegration(reservation, response, outcomeCode) {
      if (reservation.invocationId && integrationControl) {
        await integrationControl.complete({
          auth,
          invocationId: reservation.invocationId,
          responseStatus: response.status,
          outcomeCode
        });
      }
      return response;
    }

    if (identity && request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      if (!csrfValid) return json(403, { ok: false, code: "CSRF_INVALID" });
      const result = await identity.logout({ auth, csrfToken: csrfHeader, sessionToken: credentials.sessionToken });
      return json(result.ok ? 200 : statusFor(result.code), { ok: result.ok, code: result.code }, { cookies: result.setCookies || [] });
    }

    if (identity && request.method === "POST" && ["/api/v1/workspaces", "/api/v1/workspace/invitations", "/api/v1/invitations/accept"].includes(url.pathname)) {
      if (!csrfValid) return json(403, { ok: false, code: "CSRF_INVALID" });
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json(415, { ok: false, code: "JSON_CONTENT_TYPE_REQUIRED" });
      const parsed = await readJson(request);
      if (!parsed.ok) return parsed.response;
      // Identity and authority must come from the authenticated request, never JSON.
      const common = { ...parsed.value, auth, csrfToken: csrfHeader, sessionToken: credentials.sessionToken };
      const result = url.pathname === "/api/v1/workspaces"
        ? await identity.createWorkspace(common)
        : url.pathname === "/api/v1/workspace/invitations"
          ? await identity.createInvitation(common)
          : await identity.acceptInvitation(common);
      return json(result.ok ? 201 : statusFor(result.code), result);
    }

    if (request.method === "GET" && url.pathname === "/api/v1/customer-to-cash/summary") {
      const reservation = await reserveIntegration("dekta_revenue_summary");
      if (!reservation.ok) return reservation.response;
      const result = await service.summary(auth);
      const response = json(result.ok === false ? statusFor(result.code) : 200, result);
      return completeIntegration(reservation, response, result.code || "OK");
    }
    if (request.method === "GET" && url.pathname === "/api/v1/customer-to-cash/snapshot") {
      const reservation = await reserveIntegration(mcpSnapshotOperation(request));
      if (!reservation.ok) return reservation.response;
      const result = await service.snapshot(auth);
      const response = json(result.ok === false ? statusFor(result.code) : 200, result);
      return completeIntegration(reservation, response, result.code || "OK");
    }
    const match = url.pathname.match(/^\/api\/v1\/commands\/(account\.create|account\.update|account\.merge|opportunity\.create|opportunity\.stage|opportunity\.win|contract\.create|project\.create|invoice\.issue|payment\.record|consulting\.engagement\.create|consulting\.workstream\.create|consulting\.milestone\.create|consulting\.milestone\.status|consulting\.task\.create|consulting\.task\.status|consulting\.task\.comment|consulting\.assignment\.submit|consulting\.assignment\.review|consulting\.expense\.create|consulting\.expense\.review)$/);
    if (request.method === "POST" && match) {
      const reservation = await reserveIntegration(`command:${match[1]}`);
      if (!reservation.ok) return reservation.response;
      if (auth.credentialType === "integration" && !auth.allowedCommands?.includes(match[1])) {
        return completeIntegration(reservation, json(403, { ok: false, code: "INTEGRATION_COMMAND_FORBIDDEN" }), "INTEGRATION_COMMAND_FORBIDDEN");
      }
      if (!csrfValid) return completeIntegration(reservation, json(403, { ok: false, code: "CSRF_INVALID" }), "CSRF_INVALID");
      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey) return completeIntegration(reservation, json(400, { ok: false, code: "IDEMPOTENCY_KEY_REQUIRED" }), "IDEMPOTENCY_KEY_REQUIRED");
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return completeIntegration(reservation, json(400, { ok: false, code: "IDEMPOTENCY_KEY_INVALID" }), "IDEMPOTENCY_KEY_INVALID");
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return completeIntegration(reservation, json(415, { ok: false, code: "JSON_CONTENT_TYPE_REQUIRED" }), "JSON_CONTENT_TYPE_REQUIRED");
      }
      const parsed = await readJson(request);
      if (!parsed.ok) return completeIntegration(reservation, parsed.response, "INVALID_REQUEST_BODY");
      const result = await service.execute({ auth, command: match[1], payload: parsed.value, idempotencyKey });
      const response = json(result.ok ? 201 : statusFor(result.code), result);
      return completeIntegration(reservation, response, result.code || "OK");
    }
    return json(404, { ok: false, code: "ROUTE_NOT_FOUND" });
  };
}
