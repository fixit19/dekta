import { randomUUID } from "node:crypto";

function bounded(value, pattern, fallback) {
  const cleaned = String(value || "").trim();
  return pattern.test(cleaned) ? cleaned : fallback;
}

export class McpInvocationControl {
  constructor({ repository, limit = 120, windowSeconds = 60, clock = () => new Date(), id = randomUUID }) {
    if (!repository?.reserve || !repository?.complete) throw new Error("MCP invocation repository is required");
    if (!Number.isInteger(limit) || limit < 1) throw new Error("MCP invocation limit must be a positive integer");
    if (!Number.isInteger(windowSeconds) || windowSeconds < 1) throw new Error("MCP invocation window must be a positive integer");
    this.repository = repository;
    this.limit = limit;
    this.windowSeconds = windowSeconds;
    this.clock = clock;
    this.id = id;
  }

  async reserve({ auth, operation, method, requestId }) {
    if (auth?.credentialType !== "integration" || auth.integration !== "dekta_mcp_v1") {
      throw new Error("MCP invocation control requires the DEKTA integration identity");
    }
    const occurredAt = this.clock();
    const result = await this.repository.reserve({
      id: this.id(),
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      operation: bounded(operation, /^[a-z0-9._:-]{3,120}$/i, "unknown"),
      method: bounded(method, /^(GET|POST)$/, "GET"),
      requestId: bounded(requestId, /^[A-Za-z0-9._:-]{1,128}$/, null),
      occurredAt: occurredAt.toISOString()
    }, {
      since: new Date(occurredAt.getTime() - this.windowSeconds * 1000).toISOString(),
      limit: this.limit
    });
    return { ...result, retryAfterSeconds: this.windowSeconds };
  }

  async complete({ auth, invocationId, responseStatus, outcomeCode }) {
    return this.repository.complete({
      id: invocationId,
      organizationId: auth.organizationId,
      responseStatus,
      outcomeCode: bounded(outcomeCode, /^[A-Z0-9._:-]{1,120}$/, responseStatus < 400 ? "OK" : "ERROR"),
      completedAt: this.clock().toISOString()
    });
  }
}
