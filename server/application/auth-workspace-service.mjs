import { createHash, randomInt, randomUUID } from "node:crypto";

const SESSION_COOKIE = "dekta_session";
const CSRF_COOKIE = "dekta_csrf";
const TRIAL_DAYS = 14;
const SESSION_DAYS = 7;
const INVITATION_DAYS = 7;
const LOGIN_WINDOW_MS = 10 * 60_000;
const LOGIN_EMAIL_LIMIT = 5;
const LOGIN_GLOBAL_LIMIT = 50;
const LOGIN_CODE_MAX_ATTEMPTS = 5;
const PLAN_VERSION_ID = "00000000-0000-4000-8000-000000000090";
const CORE_ENTITLEMENTS = ["core.customer", "core.pipeline", "core.finance", "addon.project_operations"];
const ALLOWED_DEPARTMENTS = new Map([
  ["management", "Manajemen"],
  ["sales", "Penjualan"],
  ["customer", "Pelanggan"],
  ["marketing", "Pemasaran"],
  ["delivery", "Operasional"],
  ["finance", "Keuangan"]
]);
const INVITABLE_ROLES = new Set(["sales", "marketing", "delivery", "finance", "reviewer", "billing_admin"]);

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function cleanText(value, max) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text && text.length <= max ? text : null;
}

function uniqueValues(values) {
  return [...new Set(Array.isArray(values) ? values : [])];
}

function normalizedDepartments(values) {
  return uniqueValues(values).filter((code) => ALLOWED_DEPARTMENTS.has(code));
}

function slugify(name, suffix) {
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 44) || "workspace";
  return `${base}-${suffix.replaceAll("-", "").slice(0, 6)}`;
}

function cookie(name, value, { maxAge, httpOnly = false, secure = false, sameSite = "Lax" } = {}) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
    httpOnly ? "HttpOnly" : "",
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function invitationParts(code) {
  const [organizationId, invitationId, secret, ...rest] = String(code || "").trim().split(".");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return !rest.length && uuid.test(organizationId || "") && uuid.test(invitationId || "") && secret?.length >= 20 ? { organizationId, invitationId, secret } : null;
}

export class AuthWorkspaceService {
  constructor({ repository, environment = "development", delivery = null, now = () => new Date(), randomToken = () => `${randomUUID()}${randomUUID()}`, randomCode = () => String(randomInt(100000, 1000000)), randomId = () => randomUUID(), loginLimits = {} }) {
    if (!repository) throw new Error("Auth workspace repository is required");
    if (!["development", "test", "staging", "production"].includes(environment)) throw new Error("Unsupported authentication environment");
    if (!["development", "test"].includes(environment) && (!delivery?.sendLoginCode || !delivery?.sendInvitation)) throw new Error("External authentication requires a transactional email delivery adapter");
    this.repository = repository;
    this.environment = environment;
    this.delivery = delivery;
    this.now = now;
    this.randomToken = randomToken;
    this.randomCode = randomCode;
    this.randomId = randomId;
    this.loginLimits = {
      windowMs: loginLimits.windowMs ?? LOGIN_WINDOW_MS,
      email: loginLimits.email ?? LOGIN_EMAIL_LIMIT,
      global: loginLimits.global ?? LOGIN_GLOBAL_LIMIT
    };
    if (![this.loginLimits.windowMs, this.loginLimits.email, this.loginLimits.global].every(Number.isSafeInteger)
      || this.loginLimits.windowMs < 60_000
      || this.loginLimits.email < 1
      || this.loginLimits.global < this.loginLimits.email) {
      throw new Error("Login rate limits are invalid");
    }
  }

  async requestEmailCode({ email }) {
    const normalized = normalizeEmail(email);
    if (!normalized) return { ok: false, code: "EMAIL_INVALID" };
    const now = this.now();
    const since = new Date(now.getTime() - this.loginLimits.windowMs);
    const code = this.randomCode();
    const challenge = { id: this.randomId(), email: normalized, codeHash: hash(code), expiresAt: new Date(now.getTime() + 10 * 60_000), createdAt: now };
    const reserved = await this.repository.createChallengeWithinLimits(challenge, {
      since,
      emailLimit: this.loginLimits.email,
      globalLimit: this.loginLimits.global
    });
    if (!reserved.ok) return { ok: false, code: "LOGIN_RATE_LIMITED", retryAfterSeconds: Math.ceil(this.loginLimits.windowMs / 1000) };
    if (this.delivery) {
      try { await this.delivery.sendLoginCode({ email: normalized, code, challengeId: challenge.id, expiresInMinutes: 10 }); }
      catch {
        await this.repository.expireChallenge(challenge.id);
        return { ok: false, code: "LOGIN_DELIVERY_FAILED" };
      }
    }
    return {
      ok: true,
      challengeId: challenge.id,
      email: normalized,
      expiresInSeconds: 600,
      delivery: this.delivery ? "email" : "local_screen_only",
      ...(this.environment === "development" || this.environment === "test" ? { developmentCode: code } : {})
    };
  }

  async verifyEmailCode({ challengeId, code, displayName }) {
    const challenge = await this.repository.findChallenge(challengeId);
    if (!challenge) return { ok: false, code: "LOGIN_CODE_INVALID" };
    if (challenge.status === "used") return { ok: false, code: "LOGIN_CODE_USED" };
    if (challenge.status !== "pending") return { ok: false, code: "LOGIN_CODE_INVALID" };
    const now = this.now();
    if (new Date(challenge.expiresAt) <= now) {
      await this.repository.expireChallenge(challenge.id);
      return { ok: false, code: "LOGIN_CODE_EXPIRED" };
    }
    if (hash(code) !== challenge.codeHash) {
      await this.repository.recordChallengeFailure(challenge.id, LOGIN_CODE_MAX_ATTEMPTS);
      return { ok: false, code: "LOGIN_CODE_INVALID" };
    }
    const name = cleanText(displayName, 100) || challenge.email.split("@")[0];
    const result = await this.repository.transaction(async (tx) => {
      // Different challenges can represent the same identity. Serialize before
      // the fresh expiry check and user lookup, including when no user exists yet.
      await tx.lockLoginIdentity(challenge.email);
      const current = await tx.findChallenge(challenge.id, { forUpdate: true });
      if (!current || current.status !== "pending") return null;
      // Read the clock after acquiring the row lock; queue time cannot extend
      // the code's authority or become the new session's creation timestamp.
      const verifiedAt = this.now();
      if (new Date(current.expiresAt) <= verifiedAt) {
        await tx.expireChallenge(current.id);
        return { ok: false, code: "LOGIN_CODE_EXPIRED" };
      }
      if (!(await tx.consumeChallenge(current.id, verifiedAt))) return null;
      let user = await tx.findUserByEmail(current.email);
      user = user ? await tx.activateUser(user.id, name) : await tx.createUser({ id: this.randomId(), email: current.email, displayName: name, createdAt: verifiedAt });
      if (!user) return { ok: false, code: "LOGIN_CODE_INVALID" };
      const selectedOrganizationId = await tx.findRecentSelectedOrganization(user.id);
      const sessionToken = this.randomToken();
      const csrfToken = this.randomToken();
      const sessionId = this.randomId();
      await tx.createSession({ id: sessionId, userId: user.id, selectedOrganizationId, tokenHash: hash(sessionToken), csrfHash: hash(csrfToken), expiresAt: addDays(verifiedAt, SESSION_DAYS), createdAt: verifiedAt });
      return { user, sessionToken, csrfToken };
    });
    if (!result) return { ok: false, code: "LOGIN_CODE_USED" };
    if (result.ok === false) return result;
    const secure = this.environment !== "development" && this.environment !== "test";
    const setCookies = [
      cookie(SESSION_COOKIE, result.sessionToken, { maxAge: SESSION_DAYS * 86_400, httpOnly: true, secure, sameSite: "Lax" }),
      cookie(CSRF_COOKIE, result.csrfToken, { maxAge: SESSION_DAYS * 86_400, secure, sameSite: "Strict" })
    ];
    return { ok: true, user: result.user, setCookies, setCookie: setCookies.join(", ") };
  }

  async authenticateToken(sessionToken) {
    if (!sessionToken) return null;
    const loaded = await this.repository.loadAuthContext(hash(sessionToken), this.now());
    if (!loaded) return null;
    const { session, workspace } = loaded;
    return {
      sessionId: session.id,
      sessionTokenHash: hash(sessionToken),
      userId: session.userId,
      user: session.user,
      organizationId: workspace?.organization.id || null,
      organization: workspace?.organization || null,
      memberships: workspace?.members || [],
      currentMembership: workspace?.members.find((member) => member.userId === session.userId) || null,
      departments: workspace?.departments || [],
      subscription: workspace?.subscription || null,
      entitlements: workspace?.entitlements || [],
      invitations: workspace?.invitations || [],
      csrfHash: session.csrfHash,
      sessionExpiresAt: session.expiresAt
    };
  }

  csrfValid(auth, csrfToken) {
    return Boolean(auth?.csrfHash && csrfToken && hash(csrfToken) === auth.csrfHash);
  }

  sessionView(auth, csrfToken) {
    if (!auth) return { ok: true, authenticated: false };
    return {
      ok: true,
      authenticated: true,
      csrfReady: this.csrfValid(auth, csrfToken),
      user: auth.user,
      organization: auth.organization,
      currentMembership: auth.currentMembership,
      departments: auth.departments,
      subscription: auth.subscription,
      entitlements: auth.entitlements,
      invitations: auth.invitations,
      sessionExpiresAt: auth.sessionExpiresAt
    };
  }

  async createWorkspace({ auth, csrfToken, sessionToken, name, industry, teamSize, departments, startMode }) {
    if (!auth?.userId || !auth.sessionId) return { ok: false, code: "AUTHENTICATION_REQUIRED" };
    if (!this.csrfValid(auth, csrfToken)) return { ok: false, code: "CSRF_INVALID" };
    if (auth.organizationId) return { ok: false, code: "WORKSPACE_ALREADY_SELECTED" };
    if (!sessionToken) return { ok: false, code: "SESSION_REQUIRED" };
    const companyName = cleanText(name, 120);
    const industryValue = cleanText(industry, 60);
    const sizeValue = cleanText(teamSize, 30);
    const departmentCodes = normalizedDepartments(departments);
    if (!companyName || !industryValue || !sizeValue || !departmentCodes.length || !["sample", "empty", "import"].includes(startMode)) return { ok: false, code: "WORKSPACE_FIELDS_REQUIRED" };
    if (!departmentCodes.includes("management")) departmentCodes.unshift("management");
    const organizationId = this.randomId();
    const subscriptionId = this.randomId();
    const result = await this.repository.transaction(async (tx) => {
      // Serialize first-workspace submissions and recheck authority after waiting.
      const creator = await tx.lockWorkspaceCreator(auth.sessionId, auth.userId, hash(sessionToken), hash(csrfToken));
      const now = this.now();
      if (!creator || new Date(creator.expiresAt) <= now) return { ok: false, code: "AUTHENTICATION_REQUIRED" };
      if (creator.selectedOrganizationId) return { ok: false, code: "WORKSPACE_ALREADY_SELECTED" };
      const trialEndsAt = addDays(now, TRIAL_DAYS);
      const organization = await tx.createOrganization({ id: organizationId, name: companyName, slug: slugify(companyName, organizationId), industry: industryValue, teamSize: sizeValue, startMode, onboardedAt: now });
      await tx.setTenant(organizationId);
      const membership = await tx.createMembership({ organizationId, userId: auth.userId, roles: ["executive_admin"], departments: departmentCodes, at: now });
      const createdDepartments = [];
      for (const code of departmentCodes) createdDepartments.push(await tx.createDepartment({ id: this.randomId(), organizationId, code, name: ALLOWED_DEPARTMENTS.get(code), at: now }));
      const subscription = await tx.createTrial({ id: subscriptionId, organizationId, planVersionId: PLAN_VERSION_ID, trialEndsAt, at: now });
      for (const feature of CORE_ENTITLEMENTS) await tx.createEntitlement({ id: this.randomId(), organizationId, subscriptionId, feature, expiresAt: trialEndsAt, at: now });
      if (!(await tx.selectOrganization(auth.sessionId, auth.userId, organizationId, now))) throw new Error("Locked workspace session selection failed");
      await tx.appendAudit({ id: this.randomId(), organizationId, actorUserId: auth.userId, action: "workspace.create", entityType: "organization", entityId: organizationId, nextState: { name: companyName, industry: industryValue, teamSize: sizeValue, departments: departmentCodes, startMode, trialEndsAt: trialEndsAt.toISOString() }, reason: "Initial organization onboarding completed", correlationId: `workspace:${organizationId}`, occurredAt: now });
      return { organization, membership, departments: createdDepartments, subscription };
    });
    if (result.ok === false) return result;
    return { ok: true, ...result, trialDays: TRIAL_DAYS };
  }

  async createInvitation({ auth, csrfToken, sessionToken, email, role, departments }) {
    if (!auth?.organizationId || !auth.currentMembership) return { ok: false, code: "WORKSPACE_REQUIRED" };
    if (!this.csrfValid(auth, csrfToken)) return { ok: false, code: "CSRF_INVALID" };
    if (!auth.currentMembership.roles.includes("executive_admin")) return { ok: false, code: "ACTION_FORBIDDEN" };
    if (!auth.sessionId || !sessionToken) return { ok: false, code: "AUTHENTICATION_REQUIRED" };
    const normalized = normalizeEmail(email);
    const departmentCodes = normalizedDepartments(departments);
    if (!normalized || !INVITABLE_ROLES.has(role) || !departmentCodes.length) return { ok: false, code: "INVITATION_FIELDS_REQUIRED" };
    if (!departmentCodes.every((code) => auth.departments.some((item) => item.code === code))) return { ok: false, code: "INVITATION_DEPARTMENT_INVALID" };
    if (auth.memberships.some((member) => member.email === normalized)) return { ok: false, code: "MEMBER_ALREADY_ACTIVE" };
    const id = this.randomId();
    const secret = this.randomToken();
    const result = await this.repository.transaction(async (tx) => {
      await tx.setTenant(auth.organizationId);
      if (!(await tx.lockActiveOrganization(auth.organizationId))) return { ok: false, code: "WORKSPACE_REQUIRED" };
      if (!(await tx.lockInvitationIssuer(auth.organizationId, auth.userId))) return { ok: false, code: "ACTION_FORBIDDEN" };
      await tx.lockInvitationEmail(auth.organizationId, normalized);
      const pending = await tx.findPendingInvitationForUpdate(auth.organizationId, normalized);
      // Bind the issuer's current session after invitation locks, before any write.
      const issuer = await tx.lockInvitationSender(auth.sessionId, auth.userId, auth.organizationId, hash(sessionToken), hash(csrfToken));
      const now = this.now();
      if (!issuer || new Date(issuer.expiresAt) <= now) return { ok: false, code: "AUTHENTICATION_REQUIRED" };
      if (await tx.hasActiveMemberEmail(auth.organizationId, normalized)) return { ok: false, code: "MEMBER_ALREADY_ACTIVE" };
      if (pending && new Date(pending.expiresAt) > now) return { ok: false, code: "INVITATION_ALREADY_PENDING" };
      if (pending) {
        if (!(await tx.expireInvitation(pending.id, auth.organizationId, now))) return { ok: false, code: "INVITATION_ALREADY_PENDING" };
        await tx.appendAudit({ id: this.randomId(), organizationId: auth.organizationId, actorUserId: auth.userId, action: "invitation.expire", entityType: "organization_invitation", entityId: pending.id, priorState: { status: "pending", expiresAt: pending.expiresAt }, nextState: { status: "expired", replacementInvitationId: id }, reason: "Administrator replaced an expired invitation", correlationId: `invitation:${id}`, occurredAt: now });
      }
      const created = await tx.createInvitation({ id, organizationId: auth.organizationId, email: normalized, roles: [role], departments: departmentCodes, tokenHash: hash(secret), inviterUserId: auth.userId, expiresAt: addDays(now, INVITATION_DAYS), at: now });
      if (!created) throw new Error("Locked invitation creation failed");
      await tx.appendAudit({ id: this.randomId(), organizationId: auth.organizationId, actorUserId: auth.userId, action: "invitation.create", entityType: "organization_invitation", entityId: id, nextState: { email: normalized, roles: [role], departments: departmentCodes, expiresAt: addDays(now, INVITATION_DAYS).toISOString() }, reason: "Organization administrator invited a member", correlationId: `invitation:${id}`, occurredAt: now });
      return { ok: true, invitation: created };
    });
    if (!result.ok) return result;
    const { invitation } = result;
    const inviteCode = `${auth.organizationId}.${id}.${secret}`;
    if (this.delivery) {
      try {
        await this.delivery.sendInvitation({ email: normalized, inviteCode, invitationId: id, workspaceName: auth.organization?.name, inviterName: auth.user?.displayName, expiresInDays: INVITATION_DAYS });
      } catch {
        await this.repository.transaction(async (tx) => {
          await tx.setTenant(auth.organizationId);
          const failedAt = this.now();
          await tx.revokeInvitation(id, auth.organizationId, failedAt);
          await tx.appendAudit({ id: this.randomId(), organizationId: auth.organizationId, actorUserId: auth.userId, action: "invitation.delivery_failed", entityType: "organization_invitation", entityId: id, priorState: { status: "pending" }, nextState: { status: "revoked" }, reason: "Transactional email delivery failed", correlationId: `invitation:${id}:delivery`, occurredAt: failedAt });
        });
        return { ok: false, code: "INVITATION_DELIVERY_FAILED" };
      }
    }
    return { ok: true, invitation, delivery: this.delivery ? "email" : "local_screen_only", ...(!this.delivery ? { developmentInviteCode: inviteCode } : {}) };
  }

  async acceptInvitation({ auth, csrfToken, inviteCode, sessionToken }) {
    if (!auth?.userId || !auth.sessionId) return { ok: false, code: "AUTHENTICATION_REQUIRED" };
    if (!this.csrfValid(auth, csrfToken)) return { ok: false, code: "CSRF_INVALID" };
    if (!sessionToken) return { ok: false, code: "SESSION_REQUIRED" };
    const parts = invitationParts(inviteCode);
    if (!parts) return { ok: false, code: "INVITATION_INVALID" };
    const result = await this.repository.transaction(async (tx) => {
      await tx.setTenant(parts.organizationId);
      if (!(await tx.lockActiveOrganization(parts.organizationId))) return { ok: false, code: "INVITATION_INVALID" };
      const invitation = await tx.findInvitationForUpdate(parts.organizationId, parts.invitationId);
      if (!invitation || hash(parts.secret) !== invitation.tokenHash) return { ok: false, code: "INVITATION_INVALID" };
      if (invitation.status !== "pending") return { ok: false, code: "INVITATION_NOT_PENDING" };
      // Authentication can become stale while acceptance waits. Hold current
      // session/principal authority through the grant and read time after locks.
      const acceptor = await tx.lockInvitationAcceptor(auth.sessionId, auth.userId, hash(sessionToken), hash(csrfToken));
      const now = this.now();
      if (!acceptor || new Date(acceptor.expiresAt) <= now) return { ok: false, code: "AUTHENTICATION_REQUIRED" };
      if (new Date(invitation.expiresAt) <= now) return { ok: false, code: "INVITATION_EXPIRED" };
      if (invitation.email !== acceptor.email) return { ok: false, code: "INVITATION_EMAIL_MISMATCH" };
      const membership = await tx.createMembership({ organizationId: parts.organizationId, userId: auth.userId, roles: invitation.roles, departments: invitation.departments, at: now });
      await tx.acceptInvitation(invitation.id, parts.organizationId, auth.userId, now);
      await tx.selectOrganization(auth.sessionId, auth.userId, parts.organizationId, now);
      await tx.appendAudit({ id: this.randomId(), organizationId: parts.organizationId, actorUserId: auth.userId, action: "invitation.accept", entityType: "organization_invitation", entityId: invitation.id, priorState: { status: "pending" }, nextState: { status: "accepted", memberUserId: auth.userId, roles: invitation.roles, departments: invitation.departments }, reason: "Invited user accepted access", correlationId: `invitation:${invitation.id}:accept`, occurredAt: now });
      return { ok: true, membership, organizationId: parts.organizationId };
    });
    return result;
  }

  async logout({ auth, csrfToken }) {
    if (!auth?.sessionId || !auth.userId) return { ok: true };
    if (!this.csrfValid(auth, csrfToken)) return { ok: false, code: "CSRF_INVALID" };
    await this.repository.revokeSession(auth.sessionId, auth.userId, this.now());
    const secure = this.environment !== "development" && this.environment !== "test";
    const setCookies = [
      cookie(SESSION_COOKIE, "", { maxAge: 0, httpOnly: true, secure, sameSite: "Lax" }),
      cookie(CSRF_COOKIE, "", { maxAge: 0, secure, sameSite: "Strict" })
    ];
    return { ok: true, setCookies, setCookie: setCookies.join(", ") };
  }
}

export const AUTH_COOKIE_NAMES = Object.freeze({ session: SESSION_COOKIE, csrf: CSRF_COOKIE });
