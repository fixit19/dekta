class McpInvocationRepositorySession {
  constructor(queryable) {
    this.queryable = queryable;
  }

  query(sql, params = []) {
    return this.queryable.query(sql, params);
  }

  async setTenant(organizationId) {
    await this.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
  }

  async lockBudget(organizationId, actorUserId) {
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`mcp:${organizationId}:${actorUserId}`]);
  }

  async countAllowedSince(organizationId, actorUserId, since) {
    const result = await this.query(
      `SELECT count(*)::int AS count
       FROM mcp_invocation_events
       WHERE organization_id = $1 AND actor_user_id = $2 AND decision = 'allowed' AND occurred_at >= $3`,
      [organizationId, actorUserId, since]
    );
    return Number(result.rows[0]?.count || 0);
  }

  async insert(record) {
    await this.query(
      `INSERT INTO mcp_invocation_events
       (id, organization_id, actor_user_id, integration, operation, method, decision, response_status, outcome_code, request_id, occurred_at, completed_at)
       VALUES ($1, $2, $3, 'dekta_mcp_v1', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [record.id, record.organizationId, record.actorUserId, record.operation, record.method, record.decision,
        record.responseStatus || null, record.outcomeCode || null, record.requestId || null, record.occurredAt,
        record.completedAt || null]
    );
  }

  async complete({ id, organizationId, responseStatus, outcomeCode, completedAt }) {
    const result = await this.query(
      `UPDATE mcp_invocation_events
       SET response_status = $3, outcome_code = $4, completed_at = $5
       WHERE id = $1 AND organization_id = $2 AND decision = 'allowed'`,
      [id, organizationId, responseStatus, outcomeCode, completedAt]
    );
    return result.rowCount === 1;
  }
}

export class PostgresMcpInvocationRepository extends McpInvocationRepositorySession {
  constructor(pool) {
    if (!pool?.connect) throw new Error("PostgreSQL pool with connect is required");
    super(pool);
    this.pool = pool;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new McpInvocationRepositorySession(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reserve(record, { since, limit }) {
    return this.transaction(async (tx) => {
      await tx.setTenant(record.organizationId);
      await tx.lockBudget(record.organizationId, record.actorUserId);
      const count = await tx.countAllowedSince(record.organizationId, record.actorUserId, since);
      if (count >= limit) {
        await tx.insert({
          ...record,
          decision: "rate_limited",
          responseStatus: 429,
          outcomeCode: "INTEGRATION_RATE_LIMITED",
          completedAt: record.occurredAt
        });
        return { ok: false, invocationId: record.id };
      }
      await tx.insert({ ...record, decision: "allowed" });
      return { ok: true, invocationId: record.id };
    });
  }

  async complete(record) {
    return this.transaction(async (tx) => {
      await tx.setTenant(record.organizationId);
      return tx.complete(record);
    });
  }
}
