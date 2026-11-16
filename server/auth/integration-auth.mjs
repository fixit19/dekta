import { timingSafeEqual } from "node:crypto";

export const MCP_ALLOWED_COMMANDS = Object.freeze([
  "account.create",
  "account.update",
  "opportunity.create",
  "opportunity.stage",
  "opportunity.win"
]);

function equalSecret(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function createIntegrationAuthAdapter({ token, organizationId, userId, resolveContext }) {
  if (!token || token.length < 32) throw new Error("DEKTA_MCP_TOKEN must contain at least 32 characters");
  if (!organizationId || !userId) throw new Error("DEKTA MCP integration auth requires organization and user IDs");
  if (typeof resolveContext !== "function") throw new Error("DEKTA MCP integration auth requires a live tenant context resolver");
  return async function authenticateIntegration(request) {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ") || !equalSecret(authorization.slice(7), token)) return null;
    const context = await resolveContext({ organizationId, userId });
    const membership = context?.membership;
    if (!membership
      || membership.organizationId !== organizationId
      || membership.userId !== userId
      || membership.status !== "active") return null;
    return {
      credentialType: "integration",
      integration: "dekta_mcp_v1",
      organizationId,
      userId,
      memberships: [{ ...membership, roles: ["ai_operator"] }],
      subscription: context.subscription || null,
      entitlements: context.entitlements || [],
      allowedCommands: [...MCP_ALLOWED_COMMANDS]
    };
  };
}
