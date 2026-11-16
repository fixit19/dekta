export const ROLE_ACTIONS = Object.freeze({
  executive_admin: ["*"],
  sales: ["customer.read", "customer.write", "prospect.*", "opportunity.*", "contract.read", "project.read"],
  marketing: ["customer.read", "prospect.*", "partner.read", "campaign.*"],
  delivery: ["customer.read", "contract.read", "project.*"],
  finance: ["customer.read", "contract.read", "invoice.*", "payment.*", "partner.commission.read", "partner.payout.*"],
  billing_admin: ["subscription.*", "entitlement.read"],
  ai_operator: ["customer.read", "customer.write", "opportunity.*", "contract.read", "invoice.read"],
  reviewer: ["*.read"]
});

function matches(grant, action) {
  if (grant === "*") return true;
  if (grant === action) return true;
  if (grant.endsWith(".*")) return action.startsWith(grant.slice(0, -1));
  if (grant === "*.read") return action.endsWith(".read");
  return false;
}

export function authorize({ memberships = [], organizationId, userId, action }) {
  if (!organizationId || !userId || !action) return { ok: false, code: "INVALID_AUTH_CONTEXT" };
  const membership = memberships.find((item) => item.organizationId === organizationId && item.userId === userId && item.status === "active");
  if (!membership) return { ok: false, code: "TENANT_MEMBERSHIP_REQUIRED" };
  const grants = (membership.roles || []).flatMap((role) => ROLE_ACTIONS[role] || []);
  if (!grants.some((grant) => matches(grant, action))) return { ok: false, code: "ACTION_FORBIDDEN" };
  return { ok: true, organizationId, userId, roles: [...membership.roles] };
}
