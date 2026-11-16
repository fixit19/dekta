function clean(value) {
  return String(value || "").trim();
}

function page(items, { limit = 20, offset = 0 } = {}) {
  const total = items.length;
  const rows = items.slice(offset, offset + limit);
  return { items: rows, page: { total, limit, offset, nextOffset: offset + rows.length < total ? offset + rows.length : null } };
}

function safeError(error) {
  return {
    ok: false,
    code: clean(error?.code) || "DEKTA_MCP_ERROR",
    status: Number(error?.status) || 500,
    ...(Number(error?.retryAfterSeconds) > 0 ? { retryAfterSeconds: Number(error.retryAfterSeconds) } : {})
  };
}

export function createDektaTools(client, { clock = () => new Date() } = {}) {
  async function write(command, payload, idempotencyKey) {
    try {
      const result = await client.command(command, payload, idempotencyKey);
      return { ok: true, command, replayed: result.replayed === true, record: result.record, ...(result.contact ? { contact: result.contact } : {}) };
    } catch (error) { return safeError(error); }
  }

  return {
    async status() {
      try {
        const [health, readiness] = await Promise.all([client.health(), client.readiness()]);
        return { ok: true, service: health.service || "dekta-api", live: health.ok === true, ready: readiness.ready === true };
      } catch (error) { return safeError(error); }
    },

    async revenueSummary() {
      try {
        const result = await client.summary();
        return { ok: true, organizationId: result.organizationId, currency: "IDR", ...result.values, generatedAt: result.generatedAt };
      } catch (error) { return safeError(error); }
    },

    async listOpportunities({ status, stage, ownerUserId, limit = 20, offset = 0 } = {}) {
      try {
        const snapshot = await client.snapshot("dekta_list_opportunities");
        const accounts = new Map((snapshot.accounts || []).map((item) => [item.id, item]));
        const rows = (snapshot.opportunities || [])
          .filter((item) => !status || item.status === status)
          .filter((item) => !stage || item.stage === stage)
          .filter((item) => !ownerUserId || item.ownerUserId === ownerUserId)
          .sort((a, b) => String(a.nextActionDueAt || "").localeCompare(String(b.nextActionDueAt || "")))
          .map((item) => ({
            id: item.id, accountId: item.accountId, accountName: accounts.get(item.accountId)?.name || null,
            service: item.service, stage: item.stage, status: item.status, value: item.value, currency: item.currency,
            ownerUserId: item.ownerUserId, nextAction: item.nextAction, nextActionDueAt: item.nextActionDueAt,
            updatedAt: item.updatedAt, version: item.version
          }));
        return { ok: true, ...page(rows, { limit, offset }) };
      } catch (error) { return safeError(error); }
    },

    async listFollowups({ due = "overdue", days = 7, ownerUserId, limit = 20, offset = 0 } = {}) {
      try {
        const snapshot = await client.snapshot("dekta_list_followups");
        const now = clock();
        const horizon = new Date(now.getTime() + days * 86_400_000);
        const accounts = new Map((snapshot.accounts || []).map((item) => [item.id, item]));
        const rows = (snapshot.opportunities || [])
          .filter((item) => item.status === "active" && item.nextActionDueAt)
          .filter((item) => !ownerUserId || item.ownerUserId === ownerUserId)
          .filter((item) => {
            const date = new Date(item.nextActionDueAt);
            if (!Number.isFinite(date.getTime())) return false;
            return due === "overdue" ? date < now : date >= now && date <= horizon;
          })
          .sort((a, b) => new Date(a.nextActionDueAt) - new Date(b.nextActionDueAt))
          .map((item) => ({
            opportunityId: item.id, accountName: accounts.get(item.accountId)?.name || null,
            stage: item.stage, ownerUserId: item.ownerUserId, nextAction: item.nextAction,
            nextActionDueAt: item.nextActionDueAt,
            overdueDays: Math.max(0, Math.floor((now - new Date(item.nextActionDueAt)) / 86_400_000))
          }));
        return { ok: true, due, asOf: now.toISOString(), ...page(rows, { limit, offset }) };
      } catch (error) { return safeError(error); }
    },

    async accountContext({ accountId }) {
      try {
        const snapshot = await client.snapshot("dekta_account_context");
        const account = (snapshot.accounts || []).find((item) => item.id === accountId);
        if (!account) return { ok: false, code: "ACCOUNT_NOT_FOUND", status: 404 };
        const linked = (collection) => (snapshot[collection] || []).filter((item) => item.accountId === accountId);
        return {
          ok: true,
          account: { id: account.id, name: account.name, segment: account.segment, source: account.source, status: account.status },
          contacts: linked("contacts").map(({ id, displayName, status }) => ({ id, displayName, status })),
          opportunities: linked("opportunities").map(({ id, service, stage, status, value, currency, ownerUserId, nextAction, nextActionDueAt }) => ({ id, service, stage, status, value, currency, ownerUserId, nextAction, nextActionDueAt })),
          contracts: linked("contracts").map(({ id, opportunityId, value, currency, status, signedAt }) => ({ id, opportunityId, value, currency, status, signedAt })),
          invoices: linked("invoices").map(({ id, contractId, amount, currency, status, issuedAt, dueAt }) => ({ id, contractId, amount, currency, status, issuedAt, dueAt }))
        };
      } catch (error) { return safeError(error); }
    },

    createAccount: ({ idempotencyKey, ...payload }) => write("account.create", payload, idempotencyKey),
    updateAccount: ({ idempotencyKey, ...payload }) => write("account.update", payload, idempotencyKey),
    createOpportunity: ({ idempotencyKey, ...payload }) => write("opportunity.create", payload, idempotencyKey),
    moveOpportunityStage: ({ idempotencyKey, ...payload }) => write("opportunity.stage", payload, idempotencyKey),
    markOpportunityWon: ({ idempotencyKey, confirmed: _confirmed, ...payload }) => write("opportunity.win", payload, idempotencyKey)
  };
}
