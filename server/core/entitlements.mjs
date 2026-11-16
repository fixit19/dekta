const ACTIVE_SUBSCRIPTION_STATES = new Set(["trialing", "active", "grace"]);

export function resolveSubscriptionAccess({ subscription, at = new Date() }) {
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATES.has(subscription.status)) return { allowed: false, reason: "SUBSCRIPTION_INACTIVE" };
  if (subscription.status === "trialing" && new Date(subscription.trialEndsAt) <= at) return { allowed: false, reason: "TRIAL_EXPIRED" };
  if (subscription.status === "grace" && new Date(subscription.graceEndsAt) <= at) return { allowed: false, reason: "GRACE_EXPIRED" };
  return { allowed: true, status: subscription.status };
}

export function resolveEntitlement({ subscription, grants = [], feature, at = new Date() }) {
  const access = resolveSubscriptionAccess({ subscription, at });
  if (!access.allowed) return access;
  const grant = grants.find((item) => item.feature === feature && item.status === "active" && (!item.expiresAt || new Date(item.expiresAt) >= at));
  return grant ? { allowed: true, source: grant.source, feature } : { allowed: false, reason: "FEATURE_NOT_ENTITLED" };
}

export function applyVerifiedSubscriptionEvent(subscription, event) {
  if (!event?.verified || !event.providerEventId) return { ok: false, code: "VERIFIED_PROVIDER_EVENT_REQUIRED" };
  if ((subscription.appliedEventIds || []).includes(event.providerEventId)) return { ok: true, subscription, duplicate: true };
  const allowed = { trialing: ["active", "cancelled"], active: ["grace", "cancelled"], grace: ["active", "cancelled"], cancelled: [] };
  if (!allowed[subscription.status]?.includes(event.nextStatus)) return { ok: false, code: "INVALID_SUBSCRIPTION_TRANSITION" };
  return { ok: true, subscription: { ...subscription, status: event.nextStatus, appliedEventIds: [...(subscription.appliedEventIds || []), event.providerEventId], updatedAt: event.at } };
}
