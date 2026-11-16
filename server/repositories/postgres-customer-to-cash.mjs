const MODELS = Object.freeze({
  accounts: {
    table: "business_accounts",
    json: new Set(["customFields"]),
    fields: { id: "id", organizationId: "organization_id", name: "name", normalizedName: "normalized_name", source: "source", segment: "segment", customFields: "custom_fields", status: "status", createdAt: "created_at", updatedAt: "updated_at" }
  },
  contacts: {
    table: "business_contacts",
    fields: { id: "id", organizationId: "organization_id", accountId: "account_id", displayName: "display_name", status: "status", createdAt: "created_at", updatedAt: "updated_at" }
  },
  opportunities: {
    table: "sales_opportunities",
    money: new Set(["value"]),
    fields: { id: "id", organizationId: "organization_id", accountId: "account_id", service: "service", ownerUserId: "owner_user_id", stage: "stage", stageReference: "stage_reference", status: "status", nextAction: "next_action", nextActionDueAt: "next_action_due_at", value: "opportunity_value", currency: "currency", commitmentReference: "commitment_reference", committedAt: "committed_at", lockVersion: "lock_version", createdAt: "created_at", updatedAt: "updated_at" }
  },
  contracts: {
    table: "commercial_contracts",
    money: new Set(["value"]),
    fields: { id: "id", organizationId: "organization_id", accountId: "account_id", opportunityId: "opportunity_id", number: "contract_number", title: "title", version: "version", status: "status", value: "contract_value", currency: "currency", signedAt: "signed_at", createdAt: "created_at", updatedAt: "updated_at" }
  },
  projects: {
    table: "customer_projects",
    fields: { id: "id", organizationId: "organization_id", accountId: "account_id", opportunityId: "opportunity_id", contractId: "contract_id", title: "title", ownerUserId: "owner_user_id", status: "status", dueAt: "due_at", createdAt: "created_at", updatedAt: "updated_at" }
  },
  invoices: {
    table: "customer_invoices",
    money: new Set(["amount"]),
    fields: { id: "id", organizationId: "organization_id", accountId: "account_id", contractId: "contract_id", number: "invoice_number", status: "status", amount: "amount", currency: "currency", issuedAt: "issued_at", dueAt: "due_at", evidenceReference: "evidence_reference", createdAt: "created_at", updatedAt: "updated_at" }
  },
  payments: {
    table: "customer_payments",
    money: new Set(["amount"]),
    fields: { id: "id", organizationId: "organization_id", invoiceId: "invoice_id", amount: "amount", currency: "currency", receivedAt: "received_at", evidenceReference: "evidence_reference", createdAt: "created_at" }
  },
  consultingEngagements: {
    table: "consulting_engagements",
    money: new Set(["contractValue"]),
    fields: { id: "id", organizationId: "organization_id", accountId: "account_id", title: "title", reference: "reference", status: "status", managerUserId: "manager_user_id", pricingModel: "pricing_model", contractValue: "contract_value", currency: "currency", targetAt: "target_at", nextMilestone: "next_milestone", lockVersion: "lock_version", createdAt: "created_at", updatedAt: "updated_at" }
  },
  consultingWorkstreams: {
    table: "consulting_workstreams",
    fields: { id: "id", organizationId: "organization_id", engagementId: "engagement_id", name: "name", normalizedName: "normalized_name", ownerUserId: "owner_user_id", status: "status", dependency: "dependency", createdAt: "created_at", updatedAt: "updated_at" }
  },
  consultingMilestones: {
    table: "consulting_milestones",
    fields: { id: "id", organizationId: "organization_id", engagementId: "engagement_id", workstreamId: "workstream_id", title: "title", weight: "weight", status: "status", dueAt: "due_at", completedAt: "completed_at", evidence: "evidence", lockVersion: "lock_version", createdAt: "created_at", updatedAt: "updated_at" }
  },
  consultingTasks: {
    table: "consulting_tasks",
    fields: { id: "id", organizationId: "organization_id", engagementId: "engagement_id", workstreamId: "workstream_id", title: "title", ownerUserId: "owner_user_id", status: "status", dueAt: "due_at", blocker: "blocker", completedAt: "completed_at", lockVersion: "lock_version", createdAt: "created_at", updatedAt: "updated_at" }
  },
  consultingTaskComments: {
    table: "consulting_task_comments",
    json: new Set(["mentions"]),
    fields: { id: "id", organizationId: "organization_id", engagementId: "engagement_id", taskId: "task_id", body: "body", authorUserId: "author_user_id", mentions: "mentions", createdAt: "created_at" }
  },
  consultingNotificationIntents: {
    table: "consulting_notification_intents",
    fields: { id: "id", organizationId: "organization_id", commentId: "comment_id", recipientUserId: "recipient_user_id", channel: "channel", status: "status", externalDelivery: "external_delivery", createdAt: "created_at" }
  },
  consultingAssignmentHandoffs: {
    table: "consulting_assignment_handoffs",
    fields: { id: "id", organizationId: "organization_id", engagementId: "engagement_id", taskId: "task_id", status: "status", fromUserId: "from_user_id", toUserId: "to_user_id", reason: "reason", evidence: "evidence", dueAt: "due_at", submittedByUserId: "submitted_by_user_id", submittedAt: "submitted_at", reviewedByUserId: "reviewed_by_user_id", reviewedAt: "reviewed_at", reviewNote: "review_note", createdAt: "created_at", updatedAt: "updated_at" }
  },
  consultingExpenses: {
    table: "consulting_expenses",
    money: new Set(["amount"]),
    fields: { id: "id", organizationId: "organization_id", engagementId: "engagement_id", workstreamId: "workstream_id", taskId: "task_id", category: "category", description: "description", amount: "amount", currency: "currency", paidBy: "paid_by", treatment: "treatment", evidenceReference: "evidence_reference", incurredAt: "incurred_at", submittedByUserId: "submitted_by_user_id", submittedAt: "submitted_at", financeState: "finance_state", billingState: "billing_state", settlementState: "settlement_state", externalPosting: "external_posting", reviewedByUserId: "reviewed_by_user_id", reviewedAt: "reviewed_at", reviewNote: "review_note", lockVersion: "lock_version", createdAt: "created_at", updatedAt: "updated_at" }
  },
  auditEvents: {
    table: "audit_events",
    orderBy: "occurred_at",
    fields: { id: "id", organizationId: "organization_id", actorUserId: "actor_user_id", action: "action", entityType: "entity_type", entityId: "entity_id", priorState: "prior_state", nextState: "next_state", reason: "reason", correlationId: "correlation_id", occurredAt: "occurred_at" }
  }
});

function modelFor(collection) {
  const model = MODELS[collection];
  if (!model) throw new Error(`Unsupported repository collection: ${collection}`);
  return model;
}

function selection(model) {
  return Object.entries(model.fields).map(([field, column]) => `${column} AS "${field}"`).join(", ");
}

function decode(model, row) {
  return Object.fromEntries(Object.keys(model.fields).map((field) => {
    const value = row[field];
    if (value instanceof Date) return [field, value.toISOString()];
    if (model.money?.has(field) && value !== null && value !== undefined) return [field, Number(value)];
    if (model.json?.has(field) && typeof value === "string") return [field, JSON.parse(value)];
    return [field, value];
  }));
}

class PostgresRepositorySession {
  constructor(queryable) {
    this.queryable = queryable;
  }

  async setTenant(organizationId) {
    await this.queryable.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
  }

  async lockIdempotency(organizationId, command, key) {
    await this.queryable.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${organizationId}:${command}:${key}`]);
  }

  async lockCommandAuthority(auth) {
    const result = await this.queryable.query(
      `SELECT m.organization_id AS "organizationId", m.user_id AS "userId", m.roles, m.status
       FROM organizations o
       JOIN organization_memberships m ON m.organization_id = o.id
       JOIN users u ON u.id = m.user_id
       WHERE o.id = $1 AND m.user_id = $2
         AND o.status = 'active' AND m.status = 'active' AND u.status = 'active'
       FOR SHARE OF o, m, u`,
      [auth.organizationId, auth.userId]
    );
    return result.rows[0] || null;
  }

  async lockAssignmentMember(organizationId, userId) {
    // Keep a validated recipient eligible until this assignment commits.
    const result = await this.queryable.query(
      `SELECT m.organization_id AS "organizationId", m.user_id AS "userId", m.roles, m.status
       FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.user_id::text = $2
         AND m.status = 'active' AND u.status = 'active'
       FOR SHARE OF m, u`,
      [organizationId, String(userId || "")]
    );
    return result.rows[0] || null;
  }

  async lockCommandAccess(organizationId, feature) {
    const subscriptions = await this.queryable.query(
      `SELECT id, status, trial_ends_at AS "trialEndsAt", grace_ends_at AS "graceEndsAt",
              current_period_ends_at AS "currentPeriodEndsAt"
       FROM subscriptions WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 1 FOR SHARE`,
      [organizationId]
    );
    const grants = feature ? await this.queryable.query(
      `SELECT feature, source, status, expires_at AS "expiresAt"
       FROM entitlement_grants WHERE organization_id = $1 AND feature = $2
       ORDER BY id FOR SHARE`,
      [organizationId, feature]
    ) : { rows: [] };
    return { subscription: subscriptions.rows[0] || null, entitlements: grants.rows };
  }

  async lockCommandSession(auth) {
    const result = await this.queryable.query(
      `SELECT s.expires_at AS "expiresAt"
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.selected_organization_id = $3
         AND s.token_hash = $4 AND s.csrf_hash = $5
         AND s.status = 'active' AND u.status = 'active'
       FOR SHARE OF s, u`,
      [auth.sessionId, auth.userId, auth.organizationId, auth.sessionTokenHash, auth.csrfHash]
    );
    return result.rows[0] || null;
  }

  async list(collection, organizationId) {
    const model = modelFor(collection);
    const result = await this.queryable.query(`SELECT ${selection(model)} FROM ${model.table} WHERE organization_id = $1 ORDER BY ${model.orderBy || "created_at"} ASC`, [organizationId]);
    return result.rows.map((row) => decode(model, row));
  }

  async find(collection, organizationId, id) {
    const model = modelFor(collection);
    const result = await this.queryable.query(`SELECT ${selection(model)} FROM ${model.table} WHERE organization_id = $1 AND id = $2 LIMIT 1`, [organizationId, id]);
    return result.rows[0] ? decode(model, result.rows[0]) : null;
  }

  async findForUpdate(collection, organizationId, id) {
    const model = modelFor(collection);
    const result = await this.queryable.query(`SELECT ${selection(model)} FROM ${model.table} WHERE organization_id = $1 AND id = $2 LIMIT 1 FOR UPDATE`, [organizationId, id]);
    return result.rows[0] ? decode(model, result.rows[0]) : null;
  }

  async insert(collection, record) {
    const model = modelFor(collection);
    const entries = Object.entries(model.fields).filter(([field]) => record[field] !== undefined);
    const columns = entries.map(([, column]) => column);
    const values = entries.map(([field]) => model.json?.has(field) ? JSON.stringify(record[field]) : record[field]);
    const placeholders = entries.map(([field], index) => `$${index + 1}${model.json?.has(field) ? "::jsonb" : ""}`);
    const result = await this.queryable.query(`INSERT INTO ${model.table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${selection(model)}`, values);
    return decode(model, result.rows[0]);
  }

  async update(collection, organizationId, id, updater) {
    const current = await this.find(collection, organizationId, id);
    if (!current) return null;
    const next = typeof updater === "function" ? updater(current) : updater;
    const model = modelFor(collection);
    const entries = Object.entries(model.fields).filter(([field]) => !["id", "organizationId", "createdAt"].includes(field) && next[field] !== undefined);
    const assignments = entries.map(([field, column], index) => `${column} = $${index + 1}${model.json?.has(field) ? "::jsonb" : ""}`);
    const values = entries.map(([field]) => model.json?.has(field) ? JSON.stringify(next[field]) : next[field]);
    values.push(organizationId, id);
    const result = await this.queryable.query(`UPDATE ${model.table} SET ${assignments.join(", ")} WHERE organization_id = $${values.length - 1} AND id = $${values.length} RETURNING ${selection(model)}`, values);
    return result.rows[0] ? decode(model, result.rows[0]) : null;
  }

  async appendAudit(event) {
    return this.insert("auditEvents", event);
  }

  async getIdempotent(organizationId, command, key) {
    const result = await this.queryable.query("SELECT request_hash, response_body FROM idempotency_keys WHERE organization_id = $1 AND command = $2 AND idempotency_key = $3", [organizationId, command, key]);
    return result.rows[0] ? { requestHash: result.rows[0].request_hash, result: result.rows[0].response_body } : null;
  }

  async saveIdempotent(organizationId, command, key, requestHash, result) {
    await this.queryable.query("INSERT INTO idempotency_keys (organization_id, command, idempotency_key, request_hash, response_body) VALUES ($1, $2, $3, $4, $5::jsonb)", [organizationId, command, key, requestHash, JSON.stringify(result)]);
  }
}

export class PostgresCustomerToCashRepository extends PostgresRepositorySession {
  constructor(pool) {
    if (!pool?.query || !pool?.connect) throw new Error("PostgreSQL pool with query/connect is required");
    super(pool);
    this.pool = pool;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PostgresRepositorySession(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
