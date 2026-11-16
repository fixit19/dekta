export function createSyntheticAuthAdapter({ token, organizationId, userId, roles = ["executive_admin"], entitlements = ["addon.project_operations"], subscriptionStatus = "trialing", trialEndsAt = "2099-12-31T00:00:00.000Z", environment = "development" }) {
  if (["production", "staging"].includes(environment)) throw new Error("Synthetic authentication is forbidden outside local development and tests");
  if (!token || !organizationId || !userId) throw new Error("Synthetic auth requires server-configured token, organization, and user");
  const membership = { organizationId, userId, status: "active", roles };
  return async function authenticate(request) {
    if (request.headers.get("authorization") !== `Bearer ${token}`) return null;
    return {
      organizationId,
      userId,
      memberships: [membership],
      subscription: { status: subscriptionStatus, trialEndsAt },
      entitlements: entitlements.map((feature) => ({ feature, status: "active", source: "manual_comp" }))
    };
  };
}
