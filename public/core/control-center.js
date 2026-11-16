const ROLE_GRANTS = Object.freeze({
  executive_admin: ["*"],
  sales: ["customer.read", "customer.write", "prospect.*", "opportunity.*", "contract.read", "project.read"],
  marketing: ["customer.read", "prospect.*", "partner.read", "campaign.*"],
  delivery: ["customer.read", "contract.read", "project.*"],
  finance: ["customer.read", "contract.read", "invoice.*", "payment.*", "partner.commission.read", "partner.payout.*"],
  reviewer: ["*.read"]
});

export const ROLE_CATALOG = Object.freeze([
  { id: "executive_admin", label: "Admin perusahaan", purpose: "Atur workspace, anggota, dan kebijakan.", risk: "tinggi" },
  { id: "sales", label: "Penjualan", purpose: "Kelola calon pelanggan dan peluang.", risk: "sedang" },
  { id: "marketing", label: "Pemasaran", purpose: "Kelola sumber permintaan dan kampanye.", risk: "sedang" },
  { id: "delivery", label: "Operasional", purpose: "Kelola proyek dan pelaksanaan kerja.", risk: "sedang" },
  { id: "finance", label: "Keuangan", purpose: "Kelola invoice, pembayaran, dan payout.", risk: "tinggi" },
  { id: "reviewer", label: "Viewer / auditor", purpose: "Membaca record tanpa mengubahnya.", risk: "rendah" }
]);

export function normalizeWorkspaceModules(storedModules = [], defaultModules = []) {
  const storedByCode = new Map((storedModules || []).filter((item) => item?.code).map((item) => [item.code, item]));
  return (defaultModules || [])
    .map((module, index) => {
      const stored = storedByCode.get(module.code) || {};
      return {
        ...module,
        ...stored,
        code: module.code,
        label: module.label,
        required: Boolean(module.required),
        visible: module.required ? true : stored.visible ?? module.visible ?? true,
        order: Number.isFinite(Number(stored.order)) ? Number(stored.order) : Number(module.order ?? index + 1),
        features: (module.features || []).map((feature) => ({ ...feature }))
      };
    })
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "id-ID"))
    .map((module, index) => ({ ...module, order: index + 1 }));
}

export function requestWorkspaceModuleChange({ actor, organizationId, modules, moduleCode, visible, direction, reason }, at = new Date()) {
  if (!evaluateMemberAction({ member: actor, organizationId, action: "workspace.configuration.write" }).allowed) {
    return { ok: false, code: "ADMIN_AUTHORITY_REQUIRED" };
  }
  if (!String(reason || "").trim()) return { ok: false, code: "CHANGE_REASON_REQUIRED" };
  const ordered = [...(modules || [])].sort((left, right) => left.order - right.order).map((item) => ({ ...item }));
  const index = ordered.findIndex((item) => item.code === moduleCode);
  if (index < 0) return { ok: false, code: "MODULE_NOT_FOUND" };
  const target = ordered[index];

  if (typeof visible === "boolean") {
    if (target.required && !visible) return { ok: false, code: "REQUIRED_MODULE_CANNOT_BE_HIDDEN" };
    const next = ordered.map((item, itemIndex) => itemIndex === index ? { ...item, visible } : item);
    return {
      ok: true,
      modules: next,
      audit: {
        id: `workspace-module-${at.getTime()}`,
        organizationId,
        moduleCode,
        action: visible ? "module_shown" : "module_hidden",
        previousVisible: target.visible !== false,
        nextVisible: visible,
        reason: String(reason).trim(),
        actor: actor.name,
        at: at.toISOString(),
        dataDeleted: false
      }
    };
  }

  if (!["up", "down"].includes(direction)) return { ok: false, code: "MODULE_CHANGE_REQUIRED" };
  const destination = direction === "up" ? index - 1 : index + 1;
  if (destination < 0 || destination >= ordered.length) return { ok: false, code: "MODULE_ORDER_BOUNDARY" };
  const previousOrder = target.order;
  [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
  const next = ordered.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 }));
  return {
    ok: true,
    modules: next,
    audit: {
      id: `workspace-module-${at.getTime()}`,
      organizationId,
      moduleCode,
      action: "module_reordered",
      previousOrder,
      nextOrder: next.find((item) => item.code === moduleCode).order,
      direction,
      reason: String(reason).trim(),
      actor: actor.name,
      at: at.toISOString(),
      dataDeleted: false
    }
  };
}

function grantMatches(grant, action) {
  if (grant === "*" || grant === action) return true;
  if (grant.endsWith(".*")) return action.startsWith(grant.slice(0, -1));
  return grant === "*.read" && action.endsWith(".read");
}

export function evaluateMemberAction({ member, organizationId, action }) {
  if (!member || member.organizationId !== organizationId || member.status !== "active") {
    return { allowed: false, reason: "TENANT_MEMBERSHIP_REQUIRED" };
  }
  const grants = (member.roles || []).flatMap((role) => ROLE_GRANTS[role] || []);
  return grants.some((grant) => grantMatches(grant, action))
    ? { allowed: true, roles: [...member.roles] }
    : { allowed: false, reason: "ACTION_FORBIDDEN" };
}

export function requestRoleChange({ actor, member, nextRoles, reason, organizationId }, at = new Date()) {
  if (!evaluateMemberAction({ member: actor, organizationId, action: "membership.write" }).allowed) {
    return { ok: false, code: "ADMIN_AUTHORITY_REQUIRED" };
  }
  if (!member || member.organizationId !== organizationId) return { ok: false, code: "CROSS_TENANT_CHANGE_FORBIDDEN" };
  const roles = [...new Set((nextRoles || []).filter((role) => ROLE_GRANTS[role]))];
  if (!roles.length || !String(reason || "").trim()) return { ok: false, code: "ROLE_AND_REASON_REQUIRED" };
  return {
    ok: true,
    request: {
      id: `role-${at.getTime()}`,
      memberId: member.id,
      previousRoles: [...(member.roles || [])],
      nextRoles: roles,
      reason: String(reason).trim(),
      requestedBy: actor.name,
      requestedAt: at.toISOString(),
      status: "approved_in_prototype"
    },
    member: { ...member, roles, updatedAt: at.toISOString() }
  };
}

export function calculateTrialState(subscription, at = new Date()) {
  if (!subscription) return { state: "missing", daysRemaining: 0, canUseProduct: false };
  if (subscription.status === "trialing") {
    const remaining = Math.max(0, Math.ceil((new Date(subscription.trialEndsAt) - at) / 86_400_000));
    return { state: remaining ? "trialing" : "expired", daysRemaining: remaining, canUseProduct: remaining > 0 };
  }
  if (subscription.status === "grace") {
    const remaining = Math.max(0, Math.ceil((new Date(subscription.graceEndsAt) - at) / 86_400_000));
    return { state: remaining ? "grace" : "expired", daysRemaining: remaining, canUseProduct: remaining > 0 };
  }
  return { state: subscription.status, daysRemaining: 0, canUseProduct: subscription.status === "active" };
}

export function requestPlanChange({ subscription, planCode, actor, reason }, at = new Date()) {
  if (!subscription || !planCode || !actor || !String(reason || "").trim()) return { ok: false, code: "PLAN_CHANGE_CONTEXT_REQUIRED" };
  return {
    ok: true,
    request: {
      id: `plan-${at.getTime()}`,
      fromPlan: subscription.planCode,
      toPlan: planCode,
      status: "awaiting_verified_billing_event",
      requestedBy: actor,
      reason: String(reason).trim(),
      requestedAt: at.toISOString()
    }
  };
}

export function calculateInvoiceBreakdown({ items = [], discount = 0, taxRate = 0 }) {
  const normalizedItems = items.map((item, index) => ({
    id: item.id || `item-${index + 1}`,
    description: String(item.description || "").trim(),
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice)
  }));
  if (!normalizedItems.length || normalizedItems.some((item) => !item.description || item.quantity <= 0 || item.unitPrice < 0)) {
    return { ok: false, code: "VALID_INVOICE_ITEMS_REQUIRED" };
  }
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, Number(discount || 0)));
  const taxable = subtotal - discountAmount;
  const taxAmount = Math.round(taxable * Math.max(0, Number(taxRate || 0)) / 100);
  return { ok: true, items: normalizedItems, subtotal, discountAmount, taxRate: Number(taxRate || 0), taxAmount, total: taxable + taxAmount };
}

export function generateDocumentDraft({ template, source, variables, actor }, at = new Date()) {
  if (!template || !source?.id || !actor) return { ok: false, code: "DOCUMENT_SOURCE_REQUIRED" };
  const missing = (template.requiredVariables || []).filter((key) => !String(variables?.[key] ?? "").trim());
  if (missing.length) return { ok: false, code: "DOCUMENT_VARIABLES_MISSING", missing };
  let body = template.body;
  for (const [key, value] of Object.entries(variables || {})) body = body.replaceAll(`{{${key}}}`, String(value));
  return {
    ok: true,
    document: {
      id: `doc-${at.getTime()}`,
      templateId: template.id,
      sourceType: source.type,
      sourceId: source.id,
      title: `${template.name} — ${variables.customerName || source.id}`,
      body,
      version: 1,
      status: "draft",
      createdBy: actor,
      createdAt: at.toISOString(),
      audit: [{ at: at.toISOString(), actor, action: "draft_generated", sourceId: source.id }]
    }
  };
}

export function prepareIntegrationConnection({ kind, provider, actor, reference }, at = new Date()) {
  if (!["accounting", "payment", "email", "whatsapp"].includes(kind) || !provider || !actor || !String(reference || "").trim()) {
    return { ok: false, code: "INTEGRATION_CONTEXT_REQUIRED" };
  }
  return {
    ok: true,
    connection: {
      id: `int-${kind}`,
      kind,
      provider,
      reference: String(reference).trim(),
      status: "verification_required",
      secretsStored: false,
      configuredBy: actor,
      configuredAt: at.toISOString()
    }
  };
}

export function createCommunicationDraft({ channel, recipient, message, consentReference, source, actor }, at = new Date()) {
  if (!["email", "whatsapp"].includes(channel) || !recipient || !String(message || "").trim() || !String(consentReference || "").trim() || !source?.id) {
    return { ok: false, code: "COMMUNICATION_CONSENT_AND_SOURCE_REQUIRED" };
  }
  return {
    ok: true,
    draft: {
      id: `msg-${at.getTime()}`,
      channel,
      recipient,
      message: String(message).trim(),
      consentReference: String(consentReference).trim(),
      sourceType: source.type,
      sourceId: source.id,
      status: "draft",
      externalDelivery: false,
      createdBy: actor,
      createdAt: at.toISOString()
    }
  };
}

export function buildCopilotSuggestion(opportunity, at = new Date()) {
  if (!opportunity?.id) return { ok: false, code: "OPPORTUNITY_REQUIRED" };
  const evidence = [];
  if (opportunity.nextAction?.due) evidence.push({ field: "nextAction.due", value: opportunity.nextAction.due });
  if (opportunity.blockingReason) evidence.push({ field: "blockingReason", value: opportunity.blockingReason });
  if (opportunity.lastActivityAt) evidence.push({ field: "lastActivityAt", value: opportunity.lastActivityAt });
  if (!evidence.length) return { ok: false, code: "INSUFFICIENT_EVIDENCE" };
  const overdue = opportunity.nextAction?.due && new Date(opportunity.nextAction.due) < at;
  const action = overdue ? `Tinjau ulang: ${opportunity.nextAction.label}` : opportunity.blockingReason ? `Selesaikan hambatan: ${opportunity.blockingReason}` : `Validasi langkah berikutnya untuk ${opportunity.account}`;
  return {
    ok: true,
    suggestion: {
      id: `copilot-${opportunity.id}`,
      opportunityId: opportunity.id,
      title: action,
      rationale: overdue ? "Tindak lanjut melewati tanggal yang dijanjikan." : "Ada konteks record yang perlu dikonfirmasi manusia.",
      confidence: evidence.length >= 2 ? "sedang" : "rendah",
      evidence,
      status: "awaiting_human_review",
      generatedAt: at.toISOString(),
      model: "deterministic-prototype-v1"
    }
  };
}

export function reviewCopilotSuggestion(suggestion, { decision, actor, note }, at = new Date()) {
  if (!suggestion || !["approved", "dismissed"].includes(decision) || !actor || !String(note || "").trim()) {
    return { ok: false, code: "HUMAN_REVIEW_REQUIRED" };
  }
  return {
    ok: true,
    suggestion: {
      ...suggestion,
      status: decision === "approved" ? "approved_for_manual_action" : "dismissed",
      reviewedBy: actor,
      reviewNote: String(note).trim(),
      reviewedAt: at.toISOString(),
      externalActionExecuted: false
    }
  };
}
