import process from "node:process";
import pg from "pg";
import { latestMigrationName } from "./lib/backup-contract.mjs";
import { postgresConnectionOptions, postgresSettingsFromEnvironment } from "../server/config/postgres-connection.mjs";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const connectionOptions = await postgresConnectionOptions({ ...postgresSettingsFromEnvironment(), ssl: "require" });
const pool = new pg.Pool({
  ...connectionOptions,
  max: 1,
  connectionTimeoutMillis: 8_000
});

try {
  const role = await pool.query("SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, EXISTS (SELECT 1 FROM pg_auth_members WHERE member = pg_roles.oid) AS memberships FROM pg_roles WHERE rolname = current_user");
  const runtime = role.rows[0];
  if (runtime?.name !== "dekta_app" || [runtime.rolsuper, runtime.rolcreatedb, runtime.rolcreaterole, runtime.rolreplication, runtime.rolbypassrls, runtime.memberships].some(Boolean)) throw new Error("Runtime verification requires the dedicated unprivileged dekta_app role without role memberships");
  const requiredMigration = await latestMigrationName();
  const result = await pool.query("SELECT name FROM schema_migrations WHERE name = $1", [requiredMigration]);
  if (result.rowCount !== 1) throw new Error(`Current migration anchor is missing: ${requiredMigration}`);
  console.log(`PASS: runtime database role can connect and read the current migration anchor ${requiredMigration}.`);
} finally {
  await pool.end();
}
