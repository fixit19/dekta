import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { applySecurityHeaders } from "./security-headers.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

function safeRequestId(value) {
  const candidate = Array.isArray(value) ? value[0] : String(value || "");
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function safeErrorCode(value) {
  const candidate = String(value || "UNCLASSIFIED");
  return ERROR_CODE_PATTERN.test(candidate) ? candidate : "UNCLASSIFIED";
}

function safeErrorName(value) {
  const candidate = String(value || "Error");
  return ERROR_NAME_PATTERN.test(candidate) ? candidate : "Error";
}

async function toRequest(incoming) {
  const chunks = [];
  let size = 0;
  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("payload too large"), { code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://dekta.internal${incoming.url}`, { method: incoming.method, headers: incoming.headers, body });
}

async function send(outgoing, response, securityOptions) {
  outgoing.statusCode = response.status;
  const cookies = response.headers.getSetCookie?.() || [];
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== "set-cookie") outgoing.setHeader(name, value);
  }
  if (cookies.length) outgoing.setHeader("set-cookie", cookies);
  applySecurityHeaders(outgoing, securityOptions);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

export function createNodeServer(handler, { logger = null, exposeErrorDetails = false, httpsOnly = false } = {}) {
  return createServer({ requestTimeout: 30_000, headersTimeout: 15_000, keepAliveTimeout: 5_000, connectionsCheckingInterval: 1_000, maxHeaderSize: 16 * 1024 }, async (incoming, outgoing) => {
    const startedAt = Date.now();
    const requestId = safeRequestId(incoming.headers["x-request-id"]);
    try {
      const request = await toRequest(incoming);
      request.headers.set("x-request-id", requestId);
      const response = await handler(request);
      response.headers.set("x-request-id", requestId);
      await send(outgoing, response, { httpsOnly });
      logger?.({ level: "info", event: "http_request", requestId, method: incoming.method, path: String(incoming.url || "").split("?")[0], status: response.status, durationMs: Date.now() - startedAt });
    } catch (error) {
      const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 500;
      outgoing.statusCode = status;
      outgoing.setHeader("content-type", "application/json; charset=utf-8");
      outgoing.setHeader("cache-control", "no-store");
      outgoing.setHeader("x-request-id", requestId);
      applySecurityHeaders(outgoing, { httpsOnly });
      const publicBody = { ok: false, code: status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL_ERROR" };
      if (exposeErrorDetails && status === 500) {
        publicBody.errorCode = safeErrorCode(error?.code);
        publicBody.errorMessage = String(error?.message || "Unexpected runtime failure").replace(/[\r\n]+/g, " ").slice(0, 240);
      }
      outgoing.end(JSON.stringify(publicBody));
      logger?.({
        level: "error",
        event: "http_request_failed",
        requestId,
        method: incoming.method,
        path: String(incoming.url || "").split("?")[0],
        status,
        durationMs: Date.now() - startedAt,
        error: safeErrorName(error?.name),
        errorCode: safeErrorCode(error?.code)
      });
    }
  });
}
