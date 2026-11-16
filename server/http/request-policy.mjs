const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function denied(code) {
  return new Response(JSON.stringify({ ok: false, code }), { status: 403, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export function createRequestPolicyHandler({ handler, expectedOrigin = null }) {
  if (typeof handler !== "function") throw new Error("Request policy requires a handler");
  return async function enforce(request) {
    if (expectedOrigin && MUTATING_METHODS.has(request.method)) {
      const origin = request.headers.get("origin");
      if (origin !== expectedOrigin) return denied("ORIGIN_NOT_ALLOWED");
    }
    return handler(request);
  };
}
