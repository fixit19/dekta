function one(result) {
  return result.rows[0] || null;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    identityProvider: row.identity_provider,
    createdAt: iso(row.created_at)
  };
}

function mapOrganization(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    industry: row.industry,
    teamSize: row.team_size,
    startMode: row.start_mode,
    onboardingStatus: row.onboarding_status,
    onboardedAt: iso(row.onboarded_at),
    status: row.status
  };
}

class AuthRepositorySession {
  constructor(queryable) {
    this.queryable = queryable;
  }

  query(sql, params = []) {
    return this.queryable.query(sql, params);
  }

  async setTenant(organizationId) {
    await this.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
  }

  async createChallenge(record) {
    await this.query(
      "INSERT INTO auth_login_challenges (id, email, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
      [record.id, record.email, record.codeHash, record.expiresAt, record.createdAt]
    );
    return record;
  }

  async lockLoginChallengeBudget(email) {
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["auth:login:global"]);
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`auth:login:${email}`]);
  }

  async countRecentChallenges(email, since) {
    const row = one(await this.query("SELECT count(*)::int AS count FROM auth_login_challenges WHERE email = $1 AND created_at >= $2", [email, since]));
    return Number(row?.count || 0);
  }

  async countAllRecentChallenges(since) {
    const row = one(await this.query("SELECT count(*)::int AS count FROM auth_login_challenges WHERE created_at >= $1", [since]));
    return Number(row?.count || 0);
  }

  async findChallenge(id, { forUpdate = false } = {}) {
    const row = one(await this.query(`SELECT id, email, code_hash, status, failed_attempts, expires_at, consumed_at FROM auth_login_challenges WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]));
    return row ? { id: row.id, email: row.email, codeHash: row.code_hash, status: row.status, failedAttempts: row.failed_attempts, expiresAt: iso(row.expires_at), consumedAt: iso(row.consumed_at) } : null;
  }

  async recordChallengeFailure(id, maxAttempts) {
    await this.query(
      `UPDATE auth_login_challenges
       SET failed_attempts = failed_attempts + 1,
           status = CASE WHEN failed_attempts + 1 >= $2 THEN 'locked' ELSE status END
       WHERE id = $1 AND status = 'pending'`,
      [id, maxAttempts]
    );
  }

  async consumeChallenge(id, consumedAt) {
    const result = await this.query("UPDATE auth_login_challenges SET status = 'used', consumed_at = $2 WHERE id = $1 AND status = 'pending' AND expires_at > $2 RETURNING id", [id, consumedAt]);
    return result.rowCount === 1;
  }

  async expireChallenge(id) {
    await this.query("UPDATE auth_login_challenges SET status = 'expired' WHERE id = $1 AND status = 'pending'", [id]);
  }

  async findUserByEmail(email) {
    return mapUser(one(await this.query("SELECT id, email, display_name, identity_provider, status, created_at FROM users WHERE lower(email) = $1 LIMIT 1", [email])));
  }

  async lockLoginIdentity(email) {
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`auth:identity:${email}`]);
  }

  async createUser(record) {
    const row = one(await this.query(
      "INSERT INTO users (id, email, display_name, identity_provider, provider_subject, status, created_at) VALUES ($1, $2, $3, 'email', $4, 'active', $5) RETURNING id, email, display_name, identity_provider, status, created_at",
      [record.id, record.email, record.displayName, `email:${record.email}`, record.createdAt]
    ));
    return mapUser(row);
  }

  async activateUser(userId, displayName) {
    return mapUser(one(await this.query("UPDATE users SET display_name = $2, status = 'active' WHERE id = $1 AND status IN ('invited', 'active') RETURNING id, email, display_name, identity_provider, status, created_at", [userId, displayName])));
  }

  async createSession(record) {
    await this.query(
      "INSERT INTO auth_sessions (id, user_id, selected_organization_id, token_hash, csrf_hash, expires_at, last_seen_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
      [record.id, record.userId, record.selectedOrganizationId || null, record.tokenHash, record.csrfHash, record.expiresAt, record.createdAt]
    );
  }

  async findRecentSelectedOrganization(userId) {
    const candidates = (await this.query(
      `SELECT selected_organization_id, max(last_seen_at) AS last_seen_at, max(created_at) AS created_at
       FROM auth_sessions
       WHERE user_id = $1 AND selected_organization_id IS NOT NULL
       GROUP BY selected_organization_id
       ORDER BY last_seen_at DESC, created_at DESC`,
      [userId]
    )).rows;
    for (const candidate of candidates) {
      await this.setTenant(candidate.selected_organization_id);
      const active = one(await this.query(
        `SELECT 1
         FROM organization_memberships m
         JOIN organizations o ON o.id = m.organization_id
         WHERE m.organization_id = $1 AND m.user_id = $2
           AND m.status = 'active' AND o.status = 'active'
         LIMIT 1`,
        [candidate.selected_organization_id, userId]
      ));
      if (active) return candidate.selected_organization_id;
    }
    return null;
  }

  async findSessionByTokenHash(tokenHash, at) {
    const row = one(await this.query(
      `SELECT s.id, s.user_id, s.selected_organization_id, s.csrf_hash, s.status, s.expires_at,
              u.email, u.display_name, u.identity_provider, u.status AS user_status, u.created_at AS user_created_at
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.status = 'active' AND s.expires_at > $2 AND u.status = 'active' LIMIT 1`,
      [tokenHash, at]
    ));
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      selectedOrganizationId: row.selected_organization_id,
      csrfHash: row.csrf_hash,
      expiresAt: iso(row.expires_at),
      user: { id: row.user_id, email: row.email, displayName: row.display_name, identityProvider: row.identity_provider, status: row.user_status, createdAt: iso(row.user_created_at) }
    };
  }

  async touchSession(sessionId, at) {
    await this.query("UPDATE auth_sessions SET last_seen_at = $2 WHERE id = $1 AND status = 'active'", [sessionId, at]);
  }

  async selectOrganization(sessionId, userId, organizationId, at) {
    const result = await this.query("UPDATE auth_sessions SET selected_organization_id = $3, last_seen_at = $4 WHERE id = $1 AND user_id = $2 AND status = 'active'", [sessionId, userId, organizationId, at]);
    return result.rowCount === 1;
  }

  async revokeSession(sessionId, userId, at) {
    const result = await this.query("UPDATE auth_sessions SET status = 'revoked', revoked_at = $3 WHERE id = $1 AND user_id = $2 AND status = 'active'", [sessionId, userId, at]);
    return result.rowCount === 1;
  }

  async createOrganization(record) {
    return mapOrganization(one(await this.query(
      `INSERT INTO organizations (id, name, slug, industry, team_size, start_mode, onboarding_status, onboarded_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7, $7)
       RETURNING id, name, slug, industry, team_size, start_mode, onboarding_status, onboarded_at, status`,
      [record.id, record.name, record.slug, record.industry, record.teamSize, record.startMode, record.onboardedAt]
    )));
  }

  async lockWorkspaceCreator(sessionId, userId, tokenHash, csrfHash) {
    const row = one(await this.query(
      `SELECT s.expires_at, s.selected_organization_id
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.token_hash = $3 AND s.csrf_hash = $4
         AND s.status = 'active' AND u.status = 'active'
       FOR UPDATE OF s FOR SHARE OF u`,
      [sessionId, userId, tokenHash, csrfHash]
    ));
    return row ? { expiresAt: iso(row.expires_at), selectedOrganizationId: row.selected_organization_id } : null;
  }

  async createMembership(record) {
    const row = one(await this.query(
      `INSERT INTO organization_memberships (organization_id, user_id, roles, departments, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $5)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET roles = EXCLUDED.roles, departments = EXCLUDED.departments, status = 'active', updated_at = EXCLUDED.updated_at
       RETURNING organization_id, user_id, roles, departments, status`,
      [record.organizationId, record.userId, record.roles, record.departments, record.at]
    ));
    return { organizationId: row.organization_id, userId: row.user_id, roles: row.roles || [], departments: row.departments || [], status: row.status };
  }

  async createDepartment(record) {
    const row = one(await this.query(
      `INSERT INTO organization_departments (id, organization_id, code, name, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $5)
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = EXCLUDED.updated_at
       RETURNING id, organization_id, code, name, status`,
      [record.id, record.organizationId, record.code, record.name, record.at]
    ));
    return { id: row.id, organizationId: row.organization_id, code: row.code, name: row.name, status: row.status };
  }

  async createTrial(record) {
    const row = one(await this.query(
      `INSERT INTO subscriptions (id, organization_id, plan_version_id, status, provider, trial_ends_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'trialing', 'dekta_private_beta', $4, $5, $5)
       RETURNING id, organization_id, status, trial_ends_at, created_at`,
      [record.id, record.organizationId, record.planVersionId, record.trialEndsAt, record.at]
    ));
    return { id: row.id, organizationId: row.organization_id, status: row.status, trialEndsAt: iso(row.trial_ends_at), createdAt: iso(row.created_at) };
  }

  async createEntitlement(record) {
    await this.query(
      `INSERT INTO entitlement_grants (id, organization_id, subscription_id, feature, source, status, expires_at, reason, created_at)
       VALUES ($1, $2, $3, $4, 'plan', 'active', $5, 'Private beta trial', $6)
       ON CONFLICT (organization_id, feature, source) DO UPDATE SET subscription_id = EXCLUDED.subscription_id, status = 'active', expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason`,
      [record.id, record.organizationId, record.subscriptionId, record.feature, record.expiresAt, record.at]
    );
  }

  async appendAudit(record) {
    await this.query(
      `INSERT INTO audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, prior_state, next_state, reason, correlation_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)`,
      [record.id, record.organizationId, record.actorUserId, record.action, record.entityType, record.entityId, JSON.stringify(record.priorState || null), JSON.stringify(record.nextState || null), record.reason || null, record.correlationId, record.occurredAt]
    );
  }

  async createInvitation(record) {
    const existing = one(await this.query("SELECT id FROM organization_invitations WHERE organization_id = $1 AND lower(email) = $2 AND status = 'pending' LIMIT 1", [record.organizationId, record.email]));
    if (existing) return null;
    const row = one(await this.query(
      `INSERT INTO organization_invitations (id, organization_id, email, roles, departments, token_hash, status, inviter_user_id, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $9)
       RETURNING id, organization_id, email, roles, departments, status, inviter_user_id, expires_at, created_at`,
      [record.id, record.organizationId, record.email, record.roles, record.departments, record.tokenHash, record.inviterUserId, record.expiresAt, record.at]
    ));
    return { id: row.id, organizationId: row.organization_id, email: row.email, roles: row.roles || [], departments: row.departments || [], status: row.status, inviterUserId: row.inviter_user_id, expiresAt: iso(row.expires_at), createdAt: iso(row.created_at) };
  }

  async lockInvitationEmail(organizationId, email) {
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`invitation:${organizationId}:${email}`]);
  }

  async lockInvitationIssuer(organizationId, userId) {
    return Boolean(one(await this.query(
      `SELECT m.user_id FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active'
         AND 'executive_admin' = ANY(m.roles) AND u.status = 'active' FOR SHARE OF m, u`,
      [organizationId, userId]
    )));
  }

  async hasActiveMemberEmail(organizationId, email) {
    return Boolean(one(await this.query(
      `SELECT m.user_id FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND lower(u.email) = $2 AND m.status = 'active'`,
      [organizationId, email]
    )));
  }

  async lockInvitationSender(sessionId, userId, organizationId, tokenHash, csrfHash) {
    const row = one(await this.query(
      `SELECT s.expires_at FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.selected_organization_id = $3
         AND s.token_hash = $4 AND s.csrf_hash = $5
         AND s.status = 'active' AND u.status = 'active'
       FOR UPDATE OF s FOR SHARE OF u`,
      [sessionId, userId, organizationId, tokenHash, csrfHash]
    ));
    return row ? { expiresAt: iso(row.expires_at) } : null;
  }

  async findPendingInvitationForUpdate(organizationId, email) {
    const row = one(await this.query(
      `SELECT id, expires_at FROM organization_invitations
       WHERE organization_id = $1 AND lower(email) = $2 AND status = 'pending' FOR UPDATE`,
      [organizationId, email]
    ));
    return row ? { id: row.id, expiresAt: iso(row.expires_at) } : null;
  }

  async expireInvitation(invitationId, organizationId, at) {
    const result = await this.query(
      `UPDATE organization_invitations SET status = 'expired', updated_at = $3
       WHERE id = $1 AND organization_id = $2 AND status = 'pending' AND expires_at <= $3`,
      [invitationId, organizationId, at]
    );
    return result.rowCount === 1;
  }

  async findInvitationForUpdate(organizationId, invitationId) {
    const row = one(await this.query(
      `SELECT id, organization_id, email, roles, departments, token_hash, status, inviter_user_id, expires_at, accepted_by_user_id, accepted_at
       FROM organization_invitations WHERE organization_id = $1 AND id = $2 LIMIT 1 FOR UPDATE`,
      [organizationId, invitationId]
    ));
    return row ? { id: row.id, organizationId: row.organization_id, email: row.email, roles: row.roles || [], departments: row.departments || [], tokenHash: row.token_hash, status: row.status, inviterUserId: row.inviter_user_id, expiresAt: iso(row.expires_at), acceptedByUserId: row.accepted_by_user_id, acceptedAt: iso(row.accepted_at) } : null;
  }

  async lockActiveOrganization(organizationId) {
    // Hold the lifecycle row through invitation acceptance so suspension cannot
    // commit between the active check and the membership/session/audit writes.
    return Boolean(one(await this.query(
      "SELECT id FROM organizations WHERE id = $1 AND status = 'active' FOR SHARE",
      [organizationId]
    )));
  }

  async lockInvitationAcceptor(sessionId, userId, tokenHash, csrfHash) {
    const row = one(await this.query(
      `SELECT s.expires_at, u.email
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.token_hash = $3 AND s.csrf_hash = $4
         AND s.status = 'active' AND u.status = 'active'
       FOR UPDATE OF s FOR SHARE OF u`,
      [sessionId, userId, tokenHash, csrfHash]
    ));
    return row ? { expiresAt: iso(row.expires_at), email: row.email } : null;
  }

  async acceptInvitation(invitationId, organizationId, userId, at) {
    const result = await this.query(
      `UPDATE organization_invitations SET status = 'accepted', accepted_by_user_id = $3, accepted_at = $4, updated_at = $4
       WHERE id = $1 AND organization_id = $2 AND status = 'pending'`,
      [invitationId, organizationId, userId, at]
    );
    return result.rowCount === 1;
  }

  async revokeInvitation(invitationId, organizationId, at) {
    const result = await this.query(
      `UPDATE organization_invitations SET status = 'revoked', updated_at = $3
       WHERE id = $1 AND organization_id = $2 AND status = 'pending'`,
      [invitationId, organizationId, at]
    );
    return result.rowCount === 1;
  }

  async organizationSnapshot(organizationId) {
    const organization = mapOrganization(one(await this.query("SELECT id, name, slug, industry, team_size, start_mode, onboarding_status, onboarded_at, status FROM organizations WHERE id = $1", [organizationId])));
    if (!organization) return null;
    const [memberResult, departmentResult, subscriptionResult, entitlementResult, invitationResult] = await Promise.all([
      this.query(`SELECT m.organization_id, m.user_id, m.roles, m.departments, m.status, u.email, u.display_name
                  FROM organization_memberships m JOIN users u ON u.id = m.user_id
                  WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY u.display_name`, [organizationId]),
      this.query("SELECT id, organization_id, code, name, status FROM organization_departments WHERE organization_id = $1 AND status = 'active' ORDER BY created_at", [organizationId]),
      this.query("SELECT id, organization_id, status, trial_ends_at, grace_ends_at, current_period_ends_at FROM subscriptions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1", [organizationId]),
      this.query("SELECT feature, source, status, expires_at FROM entitlement_grants WHERE organization_id = $1 AND status = 'active' ORDER BY feature", [organizationId]),
      this.query("SELECT id, email, roles, departments, status, expires_at, created_at FROM organization_invitations WHERE organization_id = $1 AND status = 'pending' ORDER BY created_at DESC", [organizationId])
    ]);
    const subscription = one(subscriptionResult);
    return {
      organization,
      members: memberResult.rows.map((row) => ({ organizationId: row.organization_id, userId: row.user_id, email: row.email, displayName: row.display_name, roles: row.roles || [], departments: row.departments || [], status: row.status })),
      departments: departmentResult.rows.map((row) => ({ id: row.id, organizationId: row.organization_id, code: row.code, name: row.name, status: row.status })),
      subscription: subscription ? { id: subscription.id, organizationId: subscription.organization_id, status: subscription.status, trialEndsAt: iso(subscription.trial_ends_at), graceEndsAt: iso(subscription.grace_ends_at), currentPeriodEndsAt: iso(subscription.current_period_ends_at) } : null,
      entitlements: entitlementResult.rows.map((row) => ({ feature: row.feature, source: row.source, status: row.status, expiresAt: iso(row.expires_at) })),
      invitations: invitationResult.rows.map((row) => ({ id: row.id, email: row.email, roles: row.roles || [], departments: row.departments || [], status: row.status, expiresAt: iso(row.expires_at), createdAt: iso(row.created_at) }))
    };
  }
}

export class PostgresAuthWorkspaceRepository extends AuthRepositorySession {
  constructor(pool) {
    if (!pool?.query || !pool?.connect) throw new Error("PostgreSQL pool with query/connect is required");
    super(pool);
    this.pool = pool;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new AuthRepositorySession(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createChallengeWithinLimits(record, { since, emailLimit, globalLimit }) {
    return this.transaction(async (tx) => {
      await tx.lockLoginChallengeBudget(record.email);
      const globalCount = await tx.countAllRecentChallenges(since);
      if (globalCount >= globalLimit) return { ok: false, limitedBy: "global" };
      const emailCount = await tx.countRecentChallenges(record.email, since);
      if (emailCount >= emailLimit) return { ok: false, limitedBy: "email" };
      await tx.createChallenge(record);
      return { ok: true };
    });
  }

  async loadAuthContext(tokenHash, at) {
    return this.transaction(async (tx) => {
      const session = await tx.findSessionByTokenHash(tokenHash, at);
      if (!session) return null;
      await tx.touchSession(session.id, at);
      if (!session.selectedOrganizationId) return { session, workspace: null };
      await tx.setTenant(session.selectedOrganizationId);
      const workspace = await tx.organizationSnapshot(session.selectedOrganizationId);
      if (!workspace || workspace.organization.status !== "active"
        || !workspace.members.some((member) => member.userId === session.userId && member.status === "active")) return null;
      return { session, workspace };
    });
  }

  async loadIntegrationContext(organizationId, userId) {
    return this.transaction(async (tx) => {
      await tx.setTenant(organizationId);
      const principal = one(await tx.query("SELECT id FROM users WHERE id = $1 AND status = 'active'", [userId]));
      if (!principal) return null;
      const workspace = await tx.organizationSnapshot(organizationId);
      const membership = workspace?.members.find((member) => member.userId === userId && member.status === "active");
      if (!workspace || workspace.organization.status !== "active" || !membership) return null;
      return {
        membership,
        subscription: workspace.subscription,
        entitlements: workspace.entitlements
      };
    });
  }
}
