import { createHash } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000001";
const LOCAL_MEMBERS = Object.freeze([
  { userId: USER_ID, email: "owner@dekta.local", displayName: "Anggit", roles: ["executive_admin"], departments: ["management"] },
  { userId: "00000000-0000-0000-0000-000000000002", email: "sinta@dekta.local", displayName: "Sinta", roles: ["sales"], departments: ["sales"] },
  { userId: "00000000-0000-0000-0000-000000000003", email: "reza@dekta.local", displayName: "Reza", roles: ["finance"], departments: ["finance"] },
  { userId: "00000000-0000-0000-0000-000000000004", email: "yulia@dekta.local", displayName: "Yulia", roles: ["delivery"], departments: ["delivery"] }
]);

export const LOCAL_AUTH_CONTEXT = Object.freeze({
  organizationId: ORG_ID,
  userId: USER_ID,
  memberships: LOCAL_MEMBERS.map(({ userId, displayName, roles }) => ({ organizationId: ORG_ID, userId, displayName, status: "active", roles: [...roles] })),
  subscription: { status: "active" },
  entitlements: [{ feature: "addon.project_operations", status: "active", source: "local_development" }]
});

export function createPGlitePool(db) {
  let nextAvailable = Promise.resolve();
  let closing = false;

  async function acquire() {
    if (closing) throw new Error("PGlite pool is closing");
    let unlock;
    const current = new Promise((resolve) => { unlock = resolve; });
    const previous = nextAvailable;
    nextAvailable = previous.then(() => current);
    await previous;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unlock();
    };
  }

  return {
    async query(sql, params = []) {
      const release = await acquire();
      try { return await db.query(sql, params); }
      finally { release(); }
    },
    async connect() {
      const release = await acquire();
      return {
        query: (sql, params = []) => db.query(sql, params),
        release
      };
    },
    async end() {
      closing = true;
      await nextAvailable;
      await db.close();
    }
  };
}

export async function migrateLocalDatabase(db) {
  await db.exec("CREATE OR REPLACE FUNCTION gen_random_uuid() RETURNS uuid LANGUAGE SQL VOLATILE AS $$ SELECT md5(random()::text || clock_timestamp()::text)::uuid $$;");
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());");
  const directory = new URL("../migrations/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
  for (const name of names) {
    const original = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(original).digest("hex");
    const applied = await db.query("SELECT checksum FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rows.length) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration checksum changed: ${name}`);
      continue;
    }
    const source = original
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/i, "")
      .replace(/^\s*BEGIN;\s*/i, "")
      .replace(/\s*COMMIT;\s*$/i, "");
    await db.exec("BEGIN");
    try {
      await db.exec(source);
      await db.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
  return names;
}

export async function seedLocalWorkspace(db) {
  const planId = "00000000-0000-4000-8000-000000000010";
  const subscriptionId = "00000000-0000-4000-8000-000000000011";
  const entitlementId = "00000000-0000-4000-8000-000000000012";
  await db.exec("BEGIN");
  try {
    await db.query("INSERT INTO organizations (id, name, slug) VALUES ($1, 'DEKTA Local Workspace', 'dekta-local') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()", [ORG_ID]);
    await db.query("SELECT set_config('app.organization_id', $1, true)", [ORG_ID]);
    for (const member of LOCAL_MEMBERS) {
      await db.query("INSERT INTO users (id, email, display_name, identity_provider, provider_subject) VALUES ($1, $2, $3, 'email', $4) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name", [member.userId, member.email, member.displayName, `local:${member.userId}`]);
      await db.query("INSERT INTO organization_memberships (organization_id, user_id, roles, departments) VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, user_id) DO UPDATE SET roles = EXCLUDED.roles, departments = EXCLUDED.departments, status = 'active', updated_at = now()", [ORG_ID, member.userId, member.roles, member.departments]);
    }
    await db.query("INSERT INTO plan_versions (id, code, version, name, price_amount, currency, billing_interval, status, feature_grants) VALUES ($1, 'local-full-stack', 1, 'Local Full Stack', 0, 'IDR', 'month', 'active', '[\"addon.project_operations\"]'::jsonb) ON CONFLICT (id) DO NOTHING", [planId]);
    await db.query("INSERT INTO subscriptions (id, organization_id, plan_version_id, status, provider) VALUES ($1, $2, $3, 'active', 'local_development') ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now()", [subscriptionId, ORG_ID, planId]);
    await db.query("INSERT INTO entitlement_grants (id, organization_id, subscription_id, feature, source, status, reason) VALUES ($1, $2, $3, 'addon.project_operations', 'plan', 'active', 'Local full-stack development') ON CONFLICT (organization_id, feature, source) DO UPDATE SET status = 'active', expires_at = NULL, reason = EXCLUDED.reason", [entitlementId, ORG_ID, subscriptionId]);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function openLocalDatabase(dataDirectory) {
  await mkdir(dirname(dataDirectory), { recursive: true });
  const db = new PGlite(dataDirectory);
  await db.waitReady;
  await migrateLocalDatabase(db);
  await seedLocalWorkspace(db);
  return db;
}
