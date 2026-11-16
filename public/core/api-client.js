function apiBase() {
  const configured = document.querySelector('meta[name="dekta-api-base"]')?.content?.trim();
  if (!configured || configured === "disabled") return null;
  if (configured === "auto") return ["http:", "https:"].includes(location.protocol) ? location.origin : null;
  return configured.replace(/\/$/, "");
}

async function request(path, options = {}) {
  const base = apiBase();
  if (!base) return { ok: false, code: "API_NOT_CONFIGURED" };
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base}${path}`, { ...options, credentials: "include", signal: controller.signal, headers: { accept: "application/json", ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({ ok: false, code: "INVALID_API_RESPONSE" }));
    return { ...body, httpStatus: response.status };
  } catch (error) {
    return { ok: false, code: error?.name === "AbortError" ? "API_TIMEOUT" : "API_UNREACHABLE" };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function browserCookie(name) {
  const prefix = `${name}=`;
  const item = String(globalThis.document?.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  if (!item) return "";
  try { return decodeURIComponent(item.slice(prefix.length)); }
  catch { return item.slice(prefix.length); }
}

function authenticatedJson(path, payload) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": browserCookie("dekta_csrf") },
    body: JSON.stringify(payload || {})
  });
}

export async function loadIdentitySession() {
  return request("/api/v1/auth/session");
}

export async function requestEmailLoginCode(email) {
  return request("/api/v1/auth/email/request-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });
}

export async function verifyEmailLoginCode(payload) {
  return request("/api/v1/auth/email/verify-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function createWorkspace(payload) {
  return authenticatedJson("/api/v1/workspaces", payload);
}

export async function createWorkspaceInvitation(payload) {
  return authenticatedJson("/api/v1/workspace/invitations", payload);
}

export async function acceptWorkspaceInvitation(inviteCode) {
  return authenticatedJson("/api/v1/invitations/accept", { inviteCode });
}

export async function logoutIdentitySession() {
  return authenticatedJson("/api/v1/auth/logout", {});
}

function commandKey(command) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web:${command}:${random}`;
}

export async function executeServerCommand(command, payload, { idempotencyKey = commandKey(command) } = {}) {
  if (!/^(account\.create|account\.update|account\.merge|opportunity\.create|opportunity\.stage|opportunity\.win|contract\.create|project\.create|invoice\.issue|payment\.record|consulting\.engagement\.create|consulting\.workstream\.create|consulting\.milestone\.create|consulting\.milestone\.status|consulting\.task\.create|consulting\.task\.status|consulting\.task\.comment|consulting\.assignment\.submit|consulting\.assignment\.review|consulting\.expense\.create|consulting\.expense\.review)$/.test(command)) {
    return { ok: false, code: "COMMAND_NOT_SUPPORTED" };
  }
  return request(`/api/v1/commands/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "x-csrf-token": browserCookie("dekta_csrf") },
    body: JSON.stringify(payload || {})
  });
}

export async function loadAuthoritySnapshot() {
  return request("/api/v1/customer-to-cash/snapshot");
}

export async function inspectDataAuthority() {
  const base = apiBase();
  if (!base) return { mode: "synthetic", status: "local_only", base: null, reason: "API belum dikonfigurasi untuk build ini." };
  const health = await request("/healthz");
  if (!health.ok) return { mode: "synthetic", status: "api_unreachable", base, reason: "API belum dapat dijangkau; tidak ada dual write." };
  const readiness = await request("/readyz");
  if (!readiness.ok) return { mode: "synthetic", status: "api_not_ready", base, reason: "API hidup tetapi database belum siap; data lokal tidak dikirim." };
  const snapshot = await loadAuthoritySnapshot();
  if (snapshot.ok === false) return { mode: "staging", status: snapshot.httpStatus === 401 ? "authentication_required" : "api_denied", base, reason: "Snapshot operasional tenant belum dapat dibaca oleh sesi ini.", summary: null, snapshot: null };
  const summary = await request("/api/v1/customer-to-cash/summary");
  const financeSummary = summary.ok ? summary : null;
  const summaryStatus = summary.ok ? "available" : summary.httpStatus === 403 ? "role_limited" : "unavailable";
  return {
    mode: "hybrid",
    status: "customer_pipeline_connected",
    base,
    reason: summaryStatus === "role_limited"
      ? "Data operasional memakai database server; ringkasan keuangan dibatasi sesuai peran pengguna."
      : "Pelanggan, pipeline, keputusan menang, kontrak aktif, pekerjaan, invoice, pembayaran, dan operasi konsultasi memakai database server tanpa dual write.",
    summary: financeSummary,
    summaryStatus,
    snapshot
  };
}
