import process from "node:process";
import pg from "pg";
import { postgresConnectionOptions, postgresSettingsFromEnvironment } from "../server/config/postgres-connection.mjs";
import { provisionRuntimeRole } from "./lib/runtime-role.mjs";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const password = String(process.env.DEKTA_APP_DATABASE_PASSWORD || "");

if (!databaseUrl) throw new Error("DATABASE_URL is required and must use the migration/admin credential");
if (password.length < 24) throw new Error("DEKTA_APP_DATABASE_PASSWORD must contain at least 24 characters");

const connectionOptions = await postgresConnectionOptions(postgresSettingsFromEnvironment(process.env, "require"));
const pool = new pg.Pool({ ...connectionOptions, max: 1, connectionTimeoutMillis: 8_000 });

try {
  await pool.query("BEGIN");
  await provisionRuntimeRole(pool, password);
  await pool.query("COMMIT");
  console.log("Runtime database role dekta_app is provisioned with DML-only grants and NOBYPASSRLS.");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await pool.end();
}
