import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";
import { postgresConnectionOptions, postgresSettingsFromEnvironment } from "../server/config/postgres-connection.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const connectionOptions = await postgresConnectionOptions(postgresSettingsFromEnvironment());
const databaseHost = new URL(connectionOptions.connectionString).hostname;
if (databaseHost.endsWith(".neon.tech") && databaseHost.split(".")[0].endsWith("-pooler")) throw new Error("Migrations require the direct Neon connection because they use a session advisory lock");
const pool = new pg.Pool({ ...connectionOptions, max: 1, connectionTimeoutMillis: 5_000 });
const client = await pool.connect();

try {
  await client.query("SELECT pg_advisory_lock(hashtext('dekta-schema-migrations'))");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(new URL("../server/migrations/", import.meta.url))).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
  for (const name of files) {
    const source = await readFile(new URL(`../server/migrations/${name}`, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const applied = await client.query("SELECT checksum FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration checksum changed: ${name}`);
      console.log(`skip ${name}`);
      continue;
    }
    const sql = source.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      await client.query("COMMIT");
      console.log(`applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try { await client.query("SELECT pg_advisory_unlock(hashtext('dekta-schema-migrations'))"); } catch {}
  client.release();
  await pool.end();
}
