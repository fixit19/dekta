import { createHash } from "node:crypto";
import { authorize } from "../core/authorization.mjs";
import { resolveEntitlement, resolveSubscriptionAccess } from "../core/entitlements.mjs";

const COMMAND_ACTIONS = Object.freeze({
  "account.create": "customer.write",
  "account.update": "customer.write",
  "account.merge": "customer.write",
  "opportunity.create": "opportunity.write",
  "opportunity.stage": "opportunity.write",
  "opportunity.win": "opportunity.write",
  "contract.create": "contract.write",
  "project.create": "project.write",
  "invoice.issue": "invoice.write",
  "payment.record": "payment.write",
  "consulting.engagement.create": "project.write",
  "consulting.workstream.create": "project.write",
  "consulting.milestone.create": "project.write",
  "consulting.milestone.status": "project.write",
  "consulting.task.create": "project.write",
  "consulting.task.status": "project.write",
  "consulting.task.comment": "project.write",
  "consulting.assignment.submit": "project.write",
  "consulting.assignment.review": "project.write",
  "consulting.expense.create": "project.write",
  "consulting.expense.review": "invoice.write"
});

const COLLECTIONS = Object.freeze([
  "accounts", "contacts", "opportunities", "contracts", "projects", "invoices", "payments",
  "consultingEngagements", "consultingWorkstreams", "consultingMilestones", "consultingTasks",
  "consultingTaskComments", "consultingNotificationIntents", "consultingAssignmentHandoffs", "consultingExpenses",
  "auditEvents"
]);
const OPPORTUNITY_STAGES = Object.freeze(["Qualified", "Discovery", "Solution", "Proposal", "Decision"]);
const CONSULTING_PRICING_MODELS = new Set(["fixed_fee", "retainer", "milestone", "hourly"]);
const CONSULTING_TASK_STATUSES = new Set(["open", "active", "blocked", "done", "cancelled"]);
const EXPENSE_TREATMENTS = new Set(["company_cost", "included_in_fee", "employee_reimbursement", "supplier_payable", "client_rebillable"]);
const RETRYABLE_DATABASE_ERRORS = new Set(["40001", "40P01"]);
const UNIQUE_DATABASE_CONFLICTS = Object.freeze({
  "account.create": Object.freeze({ business_accounts_organization_id_normalized_name_key: "ACCOUNT_DUPLICATE" }),
  "account.update": Object.freeze({ business_accounts_organization_id_normalized_name_key: "ACCOUNT_DUPLICATE" }),
  "contract.create": Object.freeze({ commercial_contracts_organization_id_contract_number_versio_key: "CONTRACT_NUMBER_DUPLICATE" }),
  "invoice.issue": Object.freeze({ customer_invoices_organization_id_invoice_number_key: "INVOICE_NUMBER_DUPLICATE" }),
  "payment.record": Object.freeze({ customer_payments_organization_id_evidence_reference_key: "PAYMENT_EVIDENCE_DUPLICATE" }),
  "consulting.engagement.create": Object.freeze({ consulting_engagements_organization_id_reference_key: "CONSULTING_ENGAGEMENT_REFERENCE_DUPLICATE" }),
  "consulting.workstream.create": Object.freeze({ consulting_workstreams_organization_id_engagement_id_normal_key: "CONSULTING_WORKSTREAM_DUPLICATE" }),
  "consulting.assignment.submit": Object.freeze({ consulting_one_pending_handoff_per_task_idx: "CONSULTING_HANDOFF_PENDING" }),
  "consulting.expense.create": Object.freeze({ consulting_expenses_organization_id_evidence_reference_key: "CONSULTING_EXPENSE_EVIDENCE_DUPLICATE" })
});

function clean(value) {
  return String(value || "").trim();
}

function positiveMoney(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function nonNegativeMoney(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function validCurrency(value) {
  return clean(value) === "IDR";
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(clean(value))) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function payloadHash(payload) {
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

function auditEvent({ idFactory, organizationId, userId, command, entityType, entityId, priorState = null, nextState, reason = null, at, correlationId }) {
  return {
    id: idFactory("audit"), organizationId, actorUserId: userId, action: command, entityType, entityId,
    priorState, nextState, reason, correlationId, occurredAt: at.toISOString()
  };
}

function commandError(code, details) {
  return { ok: false, code, ...(details ? { details } : {}) };
}

function expectedDatabaseConflict(error, command) {
  if (RETRYABLE_DATABASE_ERRORS.has(error?.code)) return commandError("COMMAND_RETRYABLE_CONFLICT");
  if (error?.code !== "23505") return null;
  const stableCode = UNIQUE_DATABASE_CONFLICTS[command]?.[error.constraint];
  return stableCode ? commandError(stableCode) : null;
}

function normalizeName(value) {
  return clean(value).toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
}

function safeCustomFields(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 25) return null;
  const normalized = {};
  for (const [key, fieldValue] of entries) {
    const cleanKey = clean(key);
    const cleanValue = clean(fieldValue);
    if (!cleanKey || cleanKey.length > 80 || cleanValue.length > 500) return null;
    normalized[cleanKey] = cleanValue;
  }
  return normalized;
}

async function activeMember(tx, auth, userId) {
  if (tx.lockAssignmentMember) return tx.lockAssignmentMember(auth.organizationId, userId);
  return auth.memberships?.find((item) => item.organizationId === auth.organizationId && item.userId === userId && item.status === "active");
}

async function activeOpportunityOwner(tx, auth, userId) {
  const member = await activeMember(tx, auth, userId);
  return member && (member.roles || []).some((role) => ["executive_admin", "sales", "ai_operator"].includes(role));
}

async function consultingProgress(tx, organizationId, engagementId) {
  const milestones = (await tx.list("consultingMilestones", organizationId)).filter((item) => item.engagementId === engagementId);
  const totalWeight = milestones.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(milestones.filter((item) => item.status === "done").reduce((sum, item) => sum + item.weight, 0) / totalWeight * 100);
}

export function createCustomerToCashService({ repository, clock = () => new Date(), idFactory = () => crypto.randomUUID() }) {
  if (!repository) throw new Error("repository is required");

  async function execute({ auth, command, payload = {}, idempotencyKey }) {
    const action = COMMAND_ACTIONS[command];
    if (!action) return commandError("COMMAND_NOT_SUPPORTED");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(clean(idempotencyKey))) return commandError("IDEMPOTENCY_KEY_INVALID");
    const authorization = authorize({ memberships: auth?.memberships, organizationId: auth?.organizationId, userId: auth?.userId, action });
    if (!authorization.ok) return authorization;
    const subscriptionAccess = resolveSubscriptionAccess({ subscription: auth.subscription, at: clock() });
    if (!subscriptionAccess.allowed) return commandError(subscriptionAccess.reason);
    if (command === "project.create") {
      const entitlement = resolveEntitlement({ subscription: auth.subscription, grants: auth.entitlements, feature: "addon.project_operations", at: clock() });
      if (!entitlement.allowed) return commandError(entitlement.reason);
    }
    const correlationId = `cmd:${command}:${idempotencyKey}`;
    const requestHash = payloadHash(payload);
    try {
      return await repository.transaction(async (tx) => {
        await tx.setTenant?.(auth.organizationId);
        await tx.lockIdempotency?.(auth.organizationId, command, idempotencyKey);
        // Revalidate the actor after queueing; hold tenant/member/principal authority through commit.
        let commandAuth = auth;
        if (tx.lockCommandAuthority) {
          const membership = await tx.lockCommandAuthority(auth);
          if (!membership) return commandError("AUTHENTICATION_REQUIRED");
          const currentMembership = { ...membership, roles: auth.credentialType === "integration" ? ["ai_operator"] : membership.roles };
          const currentAuthorization = authorize({ memberships: [currentMembership], organizationId: auth.organizationId, userId: auth.userId, action });
          if (!currentAuthorization.ok) return currentAuthorization;
          commandAuth = { ...auth, memberships: [...auth.memberships.filter(item => item.userId !== auth.userId || item.organizationId !== auth.organizationId), currentMembership] };
        }
        // Persisted access may change while queued. Keep selected access rows locked through commit.
        if (tx.lockCommandAccess) {
          const access = await tx.lockCommandAccess(auth.organizationId, command === "project.create" ? "addon.project_operations" : null);
          commandAuth = { ...commandAuth, ...access };
        }
        // Human session authority must survive queueing and remain locked through commit.
        const session = auth.sessionId && auth.sessionTokenHash && auth.csrfHash
          ? await tx.lockCommandSession?.(auth)
          : null;
        // Queueing may outlive trial/grace or add-on access. Check before replay or dispatch.
        const at = clock();
        if (auth.sessionId && (!session || !(new Date(session.expiresAt) > at))) return commandError("AUTHENTICATION_REQUIRED");
        const currentAccess = resolveSubscriptionAccess({ subscription: commandAuth.subscription, at });
        if (!currentAccess.allowed) return commandError(currentAccess.reason);
        if (command === "project.create") {
          const entitlement = resolveEntitlement({ subscription: commandAuth.subscription, grants: commandAuth.entitlements, feature: "addon.project_operations", at });
          if (!entitlement.allowed) return commandError(entitlement.reason);
        }
        const replay = await tx.getIdempotent(auth.organizationId, command, idempotencyKey);
        if (replay && replay.requestHash !== requestHash) return commandError("IDEMPOTENCY_KEY_REUSED");
        if (replay) return { ...replay.result, replayed: true };
        const context = { tx, auth: commandAuth, command, payload, at, correlationId, idFactory };
        const handler = handlers[command];
        const handled = await handler(context);
        if (handled.ok) await tx.saveIdempotent(auth.organizationId, command, idempotencyKey, requestHash, handled);
        return handled;
      });
    } catch (error) {
      const conflict = expectedDatabaseConflict(error, command);
      if (conflict) return conflict;
      throw error;
    }
  }

  async function snapshot(auth) {
    const authorization = authorize({ memberships: auth?.memberships, organizationId: auth?.organizationId, userId: auth?.userId, action: "customer.read" });
    if (!authorization.ok) return authorization;
    return repository.transaction(async (tx) => {
      await tx.setTenant?.(auth.organizationId);
      const entries = await Promise.all(COLLECTIONS.map(async (collection) => [collection, await tx.list(collection, auth.organizationId)]));
      return {
        ...Object.fromEntries(entries),
        currentUserId: auth.userId,
        members: (auth.memberships || [])
          .filter((item) => item.organizationId === auth.organizationId && item.status === "active")
          .map(({ userId, displayName, roles = [] }) => ({ userId, displayName: displayName || userId, roles: [...roles] }))
      };
    });
  }

  async function summary(auth) {
    const authorization = authorize({ memberships: auth?.memberships, organizationId: auth?.organizationId, userId: auth?.userId, action: "invoice.read" });
    if (!authorization.ok) return authorization;
    const [opportunities, contracts, invoices, payments] = await repository.transaction(async (tx) => {
      await tx.setTenant?.(auth.organizationId);
      return Promise.all([
        tx.list("opportunities", auth.organizationId), tx.list("contracts", auth.organizationId),
        tx.list("invoices", auth.organizationId), tx.list("payments", auth.organizationId)
      ]);
    });
    const paidByInvoice = new Map();
    for (const payment of payments) paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) || 0) + payment.amount);
    const issued = invoices.filter((item) => ["issued", "partial", "paid", "overdue", "disputed"].includes(item.status));
    return {
      ok: true,
      organizationId: auth.organizationId,
      values: {
        pipeline: opportunities.filter((item) => item.status === "active").reduce((sum, item) => sum + item.value, 0),
        contracted: contracts.filter((item) => ["signed", "active"].includes(item.status)).reduce((sum, item) => sum + item.value, 0),
        invoiced: issued.reduce((sum, item) => sum + item.amount, 0),
        receivable: issued.reduce((sum, item) => sum + Math.max(0, item.amount - (paidByInvoice.get(item.id) || 0)), 0),
        collected: payments.reduce((sum, item) => sum + item.amount, 0)
      },
      generatedAt: clock().toISOString()
    };
  }

  return { execute, snapshot, summary };
}

const handlers = {
  async "account.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const name = clean(payload.name);
    if (!name) return commandError("ACCOUNT_NAME_REQUIRED");
    const normalizedName = normalizeName(name);
    const existing = (await tx.list("accounts", auth.organizationId)).find((item) => item.normalizedName === normalizedName && item.status !== "archived");
    if (existing) return commandError("ACCOUNT_DUPLICATE", { accountId: existing.id });
    const customFields = safeCustomFields(payload.customFields);
    if (customFields === null) return commandError("ACCOUNT_CUSTOM_FIELDS_INVALID");
    const record = { id: idFactory("account"), organizationId: auth.organizationId, name, normalizedName, source: clean(payload.source) || "Unknown", segment: clean(payload.segment) || "Belum disegmentasi", customFields, status: "active", createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("accounts", record);
    let contact = null;
    if (clean(payload.contactName)) {
      contact = { id: idFactory("contact"), organizationId: auth.organizationId, accountId: record.id, displayName: clean(payload.contactName), status: "active", createdAt: at.toISOString(), updatedAt: at.toISOString() };
      await tx.insert("contacts", contact);
    }
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "account", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record, contact };
  },

  async "account.update"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const current = await tx.find("accounts", auth.organizationId, payload.accountId);
    if (!current || current.status === "archived") return commandError("ACCOUNT_NOT_FOUND");
    const name = clean(payload.name);
    if (!name) return commandError("ACCOUNT_NAME_REQUIRED");
    const normalizedName = normalizeName(name);
    const duplicate = (await tx.list("accounts", auth.organizationId)).find((item) => item.id !== current.id && item.normalizedName === normalizedName && item.status !== "archived");
    if (duplicate) return commandError("ACCOUNT_DUPLICATE", { accountId: duplicate.id });
    const customFields = safeCustomFields(payload.customFields);
    if (customFields === null) return commandError("ACCOUNT_CUSTOM_FIELDS_INVALID");
    const next = { ...current, name, normalizedName, source: clean(payload.source) || current.source || "Unknown", segment: clean(payload.segment) || "Belum disegmentasi", customFields, updatedAt: at.toISOString() };
    await tx.update("accounts", auth.organizationId, current.id, next);
    const currentContact = (await tx.list("contacts", auth.organizationId)).find((item) => item.accountId === current.id && item.status !== "archived");
    let contact = currentContact || null;
    if (clean(payload.contactName)) {
      contact = currentContact
        ? { ...currentContact, displayName: clean(payload.contactName), updatedAt: at.toISOString() }
        : { id: idFactory("contact"), organizationId: auth.organizationId, accountId: current.id, displayName: clean(payload.contactName), status: "active", createdAt: at.toISOString(), updatedAt: at.toISOString() };
      if (currentContact) await tx.update("contacts", auth.organizationId, currentContact.id, contact);
      else await tx.insert("contacts", contact);
    }
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "account", entityId: next.id, priorState: current, nextState: next, at, correlationId }));
    return { ok: true, record: next, contact };
  },

  async "account.merge"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    if (payload.sourceAccountId === payload.targetAccountId || !clean(payload.reason)) return commandError("ACCOUNT_MERGE_FIELDS_REQUIRED");
    const source = await tx.find("accounts", auth.organizationId, payload.sourceAccountId);
    const target = await tx.find("accounts", auth.organizationId, payload.targetAccountId);
    if (!source || !target || source.status === "archived" || target.status === "archived") return commandError("ACCOUNT_NOT_FOUND");
    for (const collection of ["contacts", "opportunities", "contracts", "projects", "invoices", "consultingEngagements"]) {
      const records = (await tx.list(collection, auth.organizationId)).filter((item) => item.accountId === source.id);
      for (const record of records) await tx.update(collection, auth.organizationId, record.id, { ...record, accountId: target.id, updatedAt: at.toISOString() });
    }
    const archived = { ...source, status: "archived", updatedAt: at.toISOString() };
    await tx.update("accounts", auth.organizationId, source.id, archived);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "account", entityId: source.id, priorState: source, nextState: archived, reason: clean(payload.reason), at, correlationId }));
    return { ok: true, record: archived, targetRecord: target };
  },

  async "opportunity.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const required = [payload.accountId, payload.service, payload.ownerUserId, payload.stage, payload.nextAction, payload.nextActionDueAt, payload.value, payload.currency];
    if (required.some((value) => !clean(value)) || !positiveMoney(payload.value) || !validCurrency(payload.currency)) return commandError("OPPORTUNITY_CONTROL_FIELDS_REQUIRED");
    if (!OPPORTUNITY_STAGES.includes(payload.stage)) return commandError("OPPORTUNITY_STAGE_INVALID");
    if (!(await tx.find("accounts", auth.organizationId, payload.accountId))) return commandError("ACCOUNT_NOT_FOUND");
    if (!(await activeOpportunityOwner(tx, auth, payload.ownerUserId))) return commandError("OPPORTUNITY_OWNER_INVALID");
    const due = parseDate(payload.nextActionDueAt);
    if (!due || due < at) return commandError("NEXT_ACTION_DUE_INVALID");
    const record = { id: idFactory("opportunity"), organizationId: auth.organizationId, accountId: payload.accountId, service: clean(payload.service), ownerUserId: payload.ownerUserId, stage: clean(payload.stage), status: "active", nextAction: clean(payload.nextAction), nextActionDueAt: due.toISOString(), value: positiveMoney(payload.value), currency: payload.currency, createdAt: at.toISOString(), updatedAt: at.toISOString(), lockVersion: 1 };
    await tx.insert("opportunities", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "opportunity", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record };
  },

  async "opportunity.stage"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const current = await (tx.findForUpdate?.("opportunities", auth.organizationId, payload.opportunityId) || tx.find("opportunities", auth.organizationId, payload.opportunityId));
    if (!current) return commandError("OPPORTUNITY_NOT_FOUND");
    if (current.status !== "active") return commandError("OPPORTUNITY_NOT_ACTIVE");
    if (!OPPORTUNITY_STAGES.includes(payload.targetStage) || payload.targetStage === current.stage) return commandError("OPPORTUNITY_STAGE_INVALID");
    if (Number(payload.expectedLockVersion) !== current.lockVersion) return commandError("OPPORTUNITY_VERSION_CONFLICT", { currentLockVersion: current.lockVersion });
    if (!clean(payload.evidence)) return commandError("STAGE_EVIDENCE_REQUIRED");
    if (["Proposal", "Decision"].includes(payload.targetStage) && !clean(payload.reference)) return commandError("STAGE_REFERENCE_REQUIRED");
    const due = parseDate(payload.nextActionDueAt);
    if (!clean(payload.nextAction) || !due || due < at) return commandError("NEXT_ACTION_DUE_INVALID");
    const next = { ...current, stage: payload.targetStage, stageReference: clean(payload.reference) || current.stageReference || null, nextAction: clean(payload.nextAction), nextActionDueAt: due.toISOString(), updatedAt: at.toISOString(), lockVersion: current.lockVersion + 1 };
    await tx.update("opportunities", auth.organizationId, current.id, next);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "opportunity", entityId: next.id, priorState: current, nextState: next, reason: clean(payload.evidence), at, correlationId }));
    return { ok: true, record: next };
  },

  async "opportunity.win"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const current = await (tx.findForUpdate?.("opportunities", auth.organizationId, payload.opportunityId) || tx.find("opportunities", auth.organizationId, payload.opportunityId));
    if (!current) return commandError("OPPORTUNITY_NOT_FOUND");
    if (current.status !== "active") return commandError("OPPORTUNITY_NOT_ACTIVE");
    const committedAt = parseDate(payload.committedAt);
    if (!clean(payload.commitmentReference) || !committedAt || !positiveMoney(payload.value)) return commandError("WIN_EVIDENCE_REQUIRED");
    const next = { ...current, status: "won", value: positiveMoney(payload.value), commitmentReference: clean(payload.commitmentReference), committedAt: committedAt.toISOString(), nextAction: null, nextActionDueAt: null, updatedAt: at.toISOString(), lockVersion: current.lockVersion + 1 };
    await tx.update("opportunities", auth.organizationId, current.id, next);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "opportunity", entityId: next.id, priorState: current, nextState: next, reason: payload.commitmentReference, at, correlationId }));
    return { ok: true, record: next };
  },

  async "contract.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const opportunity = await tx.find("opportunities", auth.organizationId, payload.opportunityId);
    const account = await tx.find("accounts", auth.organizationId, payload.accountId);
    if (!opportunity || !account || opportunity.accountId !== account.id) return commandError("CONTRACT_SOURCE_NOT_FOUND");
    if (opportunity.status !== "won") return commandError("WON_OPPORTUNITY_REQUIRED");
    const signedAt = parseDate(payload.signedAt);
    if (![payload.number, payload.title].every(clean) || !signedAt || !positiveMoney(payload.value) || !validCurrency(payload.currency)) return commandError("CONTRACT_FIELDS_REQUIRED");
    const record = { id: idFactory("contract"), organizationId: auth.organizationId, accountId: account.id, opportunityId: opportunity.id, number: clean(payload.number), title: clean(payload.title), version: 1, status: "active", value: positiveMoney(payload.value), currency: payload.currency, signedAt: signedAt.toISOString(), createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("contracts", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "contract", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record };
  },

  async "project.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const [account, opportunity, contract] = await Promise.all([tx.find("accounts", auth.organizationId, payload.accountId), tx.find("opportunities", auth.organizationId, payload.opportunityId), tx.find("contracts", auth.organizationId, payload.contractId)]);
    if (!account || !opportunity || !contract || contract.accountId !== account.id || contract.opportunityId !== opportunity.id) return commandError("PROJECT_SOURCE_NOT_FOUND");
    const dueAt = parseDate(payload.dueAt);
    if (![payload.title, payload.ownerUserId].every(clean) || !dueAt || !(await activeMember(tx, auth, payload.ownerUserId))) return commandError("PROJECT_FIELDS_REQUIRED");
    const record = { id: idFactory("project"), organizationId: auth.organizationId, accountId: account.id, opportunityId: opportunity.id, contractId: contract.id, title: clean(payload.title), ownerUserId: payload.ownerUserId, status: "planned", dueAt: dueAt.toISOString(), createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("projects", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "project", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record };
  },

  async "invoice.issue"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const [account, contract] = await Promise.all([tx.find("accounts", auth.organizationId, payload.accountId), tx.find("contracts", auth.organizationId, payload.contractId)]);
    if (!account || !contract || contract.accountId !== account.id) return commandError("INVOICE_SOURCE_NOT_FOUND");
    const issuedAt = parseDate(payload.issuedAt);
    const dueAt = parseDate(payload.dueAt);
    if (![payload.number, payload.evidenceReference].every(clean) || !issuedAt || !dueAt || !positiveMoney(payload.amount) || !validCurrency(payload.currency)) return commandError("INVOICE_FIELDS_REQUIRED");
    if (dueAt < issuedAt) return commandError("INVOICE_DUE_INVALID");
    const record = { id: idFactory("invoice"), organizationId: auth.organizationId, accountId: account.id, contractId: contract.id, number: clean(payload.number), status: "issued", amount: positiveMoney(payload.amount), currency: payload.currency, issuedAt: issuedAt.toISOString(), dueAt: dueAt.toISOString(), evidenceReference: clean(payload.evidenceReference), createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("invoices", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "invoice", entityId: record.id, nextState: record, reason: record.evidenceReference, at, correlationId }));
    return { ok: true, record };
  },

  async "payment.record"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const invoice = await (tx.findForUpdate?.("invoices", auth.organizationId, payload.invoiceId) || tx.find("invoices", auth.organizationId, payload.invoiceId));
    if (!invoice) return commandError("INVOICE_NOT_FOUND");
    const receivedAt = parseDate(payload.receivedAt);
    if (!receivedAt || !clean(payload.evidenceReference)) return commandError("PAYMENT_EVIDENCE_REQUIRED");
    const amount = positiveMoney(payload.amount);
    if (!amount || !validCurrency(payload.currency) || payload.currency !== invoice.currency) return commandError("PAYMENT_FIELDS_REQUIRED");
    const payments = (await tx.list("payments", auth.organizationId)).filter((item) => item.invoiceId === invoice.id);
    const paid = payments.reduce((sum, item) => sum + item.amount, 0);
    if (amount > invoice.amount - paid) return commandError("PAYMENT_EXCEEDS_OUTSTANDING");
    const record = { id: idFactory("payment"), organizationId: auth.organizationId, invoiceId: invoice.id, amount, currency: payload.currency, receivedAt: receivedAt.toISOString(), evidenceReference: clean(payload.evidenceReference), createdAt: at.toISOString() };
    await tx.insert("payments", record);
    const nextInvoice = { ...invoice, status: paid + amount === invoice.amount ? "paid" : "partial", updatedAt: at.toISOString() };
    await tx.update("invoices", auth.organizationId, invoice.id, nextInvoice);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "payment", entityId: record.id, nextState: record, reason: record.evidenceReference, at, correlationId }));
    return { ok: true, record, invoice: nextInvoice };
  },

  async "consulting.engagement.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const account = await tx.find("accounts", auth.organizationId, payload.accountId);
    const targetAt = parseDate(payload.targetAt);
    const contractValue = nonNegativeMoney(payload.contractValue);
    if (!account || account.status === "archived") return commandError("ACCOUNT_NOT_FOUND");
    if (![payload.title, payload.managerUserId, payload.pricingModel, payload.currency, payload.nextMilestone].every(clean) || !targetAt || targetAt < at || contractValue === null) return commandError("CONSULTING_ENGAGEMENT_FIELDS_REQUIRED");
    if (!validCurrency(payload.currency) || !CONSULTING_PRICING_MODELS.has(payload.pricingModel)) return commandError("CONSULTING_ENGAGEMENT_FIELDS_INVALID");
    if (!(await activeMember(tx, auth, payload.managerUserId))) return commandError("CONSULTING_MEMBER_INVALID");
    const sequence = (await tx.list("consultingEngagements", auth.organizationId)).length + 1;
    const record = { id: idFactory("consulting-engagement"), organizationId: auth.organizationId, accountId: account.id, title: clean(payload.title), reference: `ENG-${String(sequence).padStart(4, "0")}`, status: "active", managerUserId: payload.managerUserId, pricingModel: payload.pricingModel, contractValue, currency: payload.currency, targetAt: targetAt.toISOString(), nextMilestone: clean(payload.nextMilestone), lockVersion: 1, createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("consultingEngagements", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_engagement", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record, progress: 0 };
  },

  async "consulting.workstream.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const engagement = await tx.find("consultingEngagements", auth.organizationId, payload.engagementId);
    const name = clean(payload.name);
    if (!engagement || engagement.status !== "active") return commandError("CONSULTING_ENGAGEMENT_NOT_FOUND");
    if (!name || !(await activeMember(tx, auth, payload.ownerUserId))) return commandError("CONSULTING_WORKSTREAM_FIELDS_REQUIRED");
    const normalizedName = normalizeName(name);
    const duplicate = (await tx.list("consultingWorkstreams", auth.organizationId)).some((item) => item.engagementId === engagement.id && item.normalizedName === normalizedName);
    if (duplicate) return commandError("CONSULTING_WORKSTREAM_DUPLICATE");
    const record = { id: idFactory("consulting-workstream"), organizationId: auth.organizationId, engagementId: engagement.id, name, normalizedName, ownerUserId: payload.ownerUserId, status: "active", dependency: clean(payload.dependency) || null, createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("consultingWorkstreams", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_workstream", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record };
  },

  async "consulting.milestone.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const [engagement, workstream] = await Promise.all([tx.find("consultingEngagements", auth.organizationId, payload.engagementId), tx.find("consultingWorkstreams", auth.organizationId, payload.workstreamId)]);
    const weight = Number(payload.weight);
    const dueAt = payload.dueAt ? parseDate(payload.dueAt) : null;
    if (!engagement || !workstream || workstream.engagementId !== engagement.id) return commandError("CONSULTING_WORKSTREAM_NOT_FOUND");
    if (!clean(payload.title) || !Number.isInteger(weight) || weight < 1 || weight > 100 || (payload.dueAt && !dueAt)) return commandError("CONSULTING_MILESTONE_FIELDS_REQUIRED");
    const totalWeight = (await tx.list("consultingMilestones", auth.organizationId)).filter((item) => item.engagementId === engagement.id).reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight + weight > 100) return commandError("CONSULTING_MILESTONE_WEIGHT_EXCEEDED", { remainingWeight: 100 - totalWeight });
    const record = { id: idFactory("consulting-milestone"), organizationId: auth.organizationId, engagementId: engagement.id, workstreamId: workstream.id, title: clean(payload.title), weight, status: "open", dueAt: dueAt?.toISOString() || null, completedAt: null, evidence: null, lockVersion: 1, createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("consultingMilestones", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_milestone", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record, progress: await consultingProgress(tx, auth.organizationId, engagement.id) };
  },

  async "consulting.milestone.status"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const current = await (tx.findForUpdate?.("consultingMilestones", auth.organizationId, payload.milestoneId) || tx.find("consultingMilestones", auth.organizationId, payload.milestoneId));
    if (!current) return commandError("CONSULTING_MILESTONE_NOT_FOUND");
    if (!new Set(["open", "done"]).has(payload.status)) return commandError("CONSULTING_MILESTONE_STATUS_INVALID");
    if (Number(payload.expectedLockVersion) !== current.lockVersion) return commandError("CONSULTING_MILESTONE_VERSION_CONFLICT", { currentLockVersion: current.lockVersion });
    if (payload.status === "done" && !clean(payload.evidence)) return commandError("CONSULTING_MILESTONE_EVIDENCE_REQUIRED");
    const next = { ...current, status: payload.status, evidence: payload.status === "done" ? clean(payload.evidence) : null, completedAt: payload.status === "done" ? at.toISOString() : null, lockVersion: current.lockVersion + 1, updatedAt: at.toISOString() };
    await tx.update("consultingMilestones", auth.organizationId, current.id, next);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_milestone", entityId: next.id, priorState: current, nextState: next, reason: clean(payload.evidence) || "Status milestone diperbarui", at, correlationId }));
    return { ok: true, record: next, progress: await consultingProgress(tx, auth.organizationId, current.engagementId) };
  },

  async "consulting.task.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const [engagement, workstream] = await Promise.all([tx.find("consultingEngagements", auth.organizationId, payload.engagementId), tx.find("consultingWorkstreams", auth.organizationId, payload.workstreamId)]);
    const dueAt = parseDate(payload.dueAt);
    if (!engagement || !workstream || workstream.engagementId !== engagement.id) return commandError("CONSULTING_WORKSTREAM_NOT_FOUND");
    if (!clean(payload.title) || !dueAt || !(await activeMember(tx, auth, payload.ownerUserId))) return commandError("CONSULTING_TASK_FIELDS_REQUIRED");
    const record = { id: idFactory("consulting-task"), organizationId: auth.organizationId, engagementId: engagement.id, workstreamId: workstream.id, title: clean(payload.title), ownerUserId: payload.ownerUserId, status: "open", dueAt: dueAt.toISOString(), blocker: null, completedAt: null, lockVersion: 1, createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("consultingTasks", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_task", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record };
  },

  async "consulting.task.status"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const current = await (tx.findForUpdate?.("consultingTasks", auth.organizationId, payload.taskId) || tx.find("consultingTasks", auth.organizationId, payload.taskId));
    if (!current) return commandError("CONSULTING_TASK_NOT_FOUND");
    if (!CONSULTING_TASK_STATUSES.has(payload.status)) return commandError("CONSULTING_TASK_STATUS_INVALID");
    if (Number(payload.expectedLockVersion) !== current.lockVersion) return commandError("CONSULTING_TASK_VERSION_CONFLICT", { currentLockVersion: current.lockVersion });
    if (!clean(payload.evidence)) return commandError("CONSULTING_TASK_EVIDENCE_REQUIRED");
    if (payload.status === "blocked" && !clean(payload.blocker)) return commandError("CONSULTING_TASK_BLOCKER_REQUIRED");
    const next = { ...current, status: payload.status, blocker: payload.status === "blocked" ? clean(payload.blocker) : null, completedAt: payload.status === "done" ? at.toISOString() : null, lockVersion: current.lockVersion + 1, updatedAt: at.toISOString() };
    await tx.update("consultingTasks", auth.organizationId, current.id, next);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_task", entityId: next.id, priorState: current, nextState: next, reason: clean(payload.evidence), at, correlationId }));
    return { ok: true, record: next };
  },

  async "consulting.task.comment"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const task = await tx.find("consultingTasks", auth.organizationId, payload.taskId);
    const body = clean(payload.body);
    if (!task) return commandError("CONSULTING_TASK_NOT_FOUND");
    if (!body || body.length > 4000) return commandError("CONSULTING_COMMENT_BODY_INVALID");
    const mentions = [...new Set(Array.isArray(payload.mentionUserIds) ? payload.mentionUserIds : [])].filter((id) => id !== auth.userId);
    for (const id of [...mentions].sort()) {
      if (!(await activeMember(tx, auth, id))) return commandError("CONSULTING_MEMBER_INVALID");
    }
    const record = { id: idFactory("consulting-comment"), organizationId: auth.organizationId, engagementId: task.engagementId, taskId: task.id, body, authorUserId: auth.userId, mentions, createdAt: at.toISOString() };
    await tx.insert("consultingTaskComments", record);
    const notificationIntents = [];
    for (const recipientUserId of mentions) {
      const intent = { id: idFactory("consulting-notification"), organizationId: auth.organizationId, commentId: record.id, recipientUserId, channel: "in_app", status: "pending", externalDelivery: false, createdAt: at.toISOString() };
      await tx.insert("consultingNotificationIntents", intent);
      notificationIntents.push(intent);
    }
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_task_comment", entityId: record.id, nextState: record, at, correlationId }));
    return { ok: true, record, notificationIntents };
  },

  async "consulting.assignment.submit"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const task = await (tx.findForUpdate?.("consultingTasks", auth.organizationId, payload.taskId) || tx.find("consultingTasks", auth.organizationId, payload.taskId));
    const dueAt = parseDate(payload.dueAt);
    if (!task) return commandError("CONSULTING_TASK_NOT_FOUND");
    if (!(await activeMember(tx, auth, payload.toUserId)) || payload.toUserId === task.ownerUserId) return commandError("CONSULTING_HANDOFF_RECIPIENT_INVALID");
    if (![payload.reason, payload.evidence].every(clean) || !dueAt || dueAt < at) return commandError("CONSULTING_HANDOFF_FIELDS_REQUIRED");
    const pending = (await tx.list("consultingAssignmentHandoffs", auth.organizationId)).some((item) => item.taskId === task.id && item.status === "awaiting_acceptance");
    if (pending) return commandError("CONSULTING_HANDOFF_PENDING");
    const record = { id: idFactory("consulting-handoff"), organizationId: auth.organizationId, engagementId: task.engagementId, taskId: task.id, status: "awaiting_acceptance", fromUserId: task.ownerUserId, toUserId: payload.toUserId, reason: clean(payload.reason), evidence: clean(payload.evidence), dueAt: dueAt.toISOString(), submittedByUserId: auth.userId, submittedAt: at.toISOString(), reviewedByUserId: null, reviewedAt: null, reviewNote: null, createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("consultingAssignmentHandoffs", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_assignment_handoff", entityId: record.id, nextState: record, reason: record.reason, at, correlationId }));
    return { ok: true, record, task };
  },

  async "consulting.assignment.review"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const current = await (tx.findForUpdate?.("consultingAssignmentHandoffs", auth.organizationId, payload.handoffId) || tx.find("consultingAssignmentHandoffs", auth.organizationId, payload.handoffId));
    if (!current) return commandError("CONSULTING_HANDOFF_NOT_FOUND");
    if (current.status !== "awaiting_acceptance") return commandError("CONSULTING_HANDOFF_ALREADY_REVIEWED");
    if (current.toUserId !== auth.userId) return commandError("CONSULTING_HANDOFF_REVIEWER_INVALID");
    if (!new Set(["accept", "reject"]).has(payload.decision) || !clean(payload.note)) return commandError("CONSULTING_HANDOFF_REVIEW_FIELDS_REQUIRED");
    const task = await (tx.findForUpdate?.("consultingTasks", auth.organizationId, current.taskId) || tx.find("consultingTasks", auth.organizationId, current.taskId));
    if (!task) return commandError("CONSULTING_TASK_NOT_FOUND");
    if (Number(payload.expectedTaskLockVersion) !== task.lockVersion) return commandError("CONSULTING_TASK_VERSION_CONFLICT", { currentLockVersion: task.lockVersion });
    const accepted = payload.decision === "accept";
    const reviewed = { ...current, status: accepted ? "accepted" : "rejected", reviewedByUserId: auth.userId, reviewedAt: at.toISOString(), reviewNote: clean(payload.note), updatedAt: at.toISOString() };
    const nextTask = { ...task, ownerUserId: accepted ? current.toUserId : task.ownerUserId, lockVersion: task.lockVersion + 1, updatedAt: at.toISOString() };
    await tx.update("consultingAssignmentHandoffs", auth.organizationId, current.id, reviewed);
    await tx.update("consultingTasks", auth.organizationId, task.id, nextTask);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_assignment_handoff", entityId: reviewed.id, priorState: current, nextState: reviewed, reason: reviewed.reviewNote, at, correlationId }));
    return { ok: true, record: reviewed, task: nextTask };
  },

  async "consulting.expense.create"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const task = await tx.find("consultingTasks", auth.organizationId, payload.taskId);
    const incurredAt = parseDate(payload.incurredAt);
    const amount = positiveMoney(payload.amount);
    if (!task) return commandError("CONSULTING_TASK_NOT_FOUND");
    if (![payload.category, payload.description, payload.paidBy, payload.treatment, payload.evidenceReference].every(clean) || !amount || !incurredAt || !validCurrency(payload.currency)) return commandError("CONSULTING_EXPENSE_FIELDS_REQUIRED");
    if (!EXPENSE_TREATMENTS.has(payload.treatment)) return commandError("CONSULTING_EXPENSE_TREATMENT_INVALID");
    const duplicate = (await tx.list("consultingExpenses", auth.organizationId)).some((item) => item.evidenceReference === clean(payload.evidenceReference));
    if (duplicate) return commandError("CONSULTING_EXPENSE_EVIDENCE_DUPLICATE");
    const settlementState = payload.treatment === "employee_reimbursement" ? "awaiting_reimbursement" : payload.treatment === "supplier_payable" ? "awaiting_supplier_payment" : "not_posted";
    const record = { id: idFactory("consulting-expense"), organizationId: auth.organizationId, engagementId: task.engagementId, workstreamId: task.workstreamId, taskId: task.id, category: clean(payload.category), description: clean(payload.description), amount, currency: payload.currency, paidBy: clean(payload.paidBy), treatment: payload.treatment, evidenceReference: clean(payload.evidenceReference), incurredAt: incurredAt.toISOString(), submittedByUserId: auth.userId, submittedAt: at.toISOString(), financeState: "awaiting_review", billingState: "not_applicable", settlementState, externalPosting: false, reviewedByUserId: null, reviewedAt: null, reviewNote: null, lockVersion: 1, createdAt: at.toISOString(), updatedAt: at.toISOString() };
    await tx.insert("consultingExpenses", record);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_expense", entityId: record.id, nextState: record, reason: record.evidenceReference, at, correlationId }));
    return { ok: true, record };
  },

  async "consulting.expense.review"({ tx, auth, command, payload, at, correlationId, idFactory }) {
    const current = await (tx.findForUpdate?.("consultingExpenses", auth.organizationId, payload.expenseId) || tx.find("consultingExpenses", auth.organizationId, payload.expenseId));
    if (!current) return commandError("CONSULTING_EXPENSE_NOT_FOUND");
    if (current.financeState !== "awaiting_review") return commandError("CONSULTING_EXPENSE_ALREADY_REVIEWED");
    if (Number(payload.expectedLockVersion) !== current.lockVersion) return commandError("CONSULTING_EXPENSE_VERSION_CONFLICT", { currentLockVersion: current.lockVersion });
    if (!new Set(["approve", "reject"]).has(payload.decision) || !clean(payload.note)) return commandError("CONSULTING_EXPENSE_REVIEW_FIELDS_REQUIRED");
    const approved = payload.decision === "approve";
    const next = { ...current, financeState: approved ? "approved" : "rejected", billingState: approved && current.treatment === "client_rebillable" ? "ready_for_invoice_draft" : "not_applicable", settlementState: approved && !["employee_reimbursement", "supplier_payable"].includes(current.treatment) ? "approved_cost" : current.settlementState, externalPosting: false, reviewedByUserId: auth.userId, reviewedAt: at.toISOString(), reviewNote: clean(payload.note), lockVersion: current.lockVersion + 1, updatedAt: at.toISOString() };
    await tx.update("consultingExpenses", auth.organizationId, current.id, next);
    await tx.appendAudit(auditEvent({ idFactory, organizationId: auth.organizationId, userId: auth.userId, command, entityType: "consulting_expense", entityId: next.id, priorState: current, nextState: next, reason: next.reviewNote, at, correlationId }));
    return { ok: true, record: next };
  }
};
