import { readdir } from "node:fs/promises";
import { basename } from "node:path";

export const BACKUP_MANIFEST_FORMAT_VERSION = 2;
export const BACKUP_APPLICATION = "dekta";

export async function migrationNames(
  migrationDirectory = new URL("../../server/migrations/", import.meta.url)
) {
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();
  if (!migrations.length) throw new Error("No DEKTA migrations were found");
  return migrations;
}

export async function latestMigrationName(migrationDirectory) {
  return (await migrationNames(migrationDirectory)).at(-1);
}

export function validateBackupManifest({ manifest, backupPath, bytes, sha256, knownMigrations, currentLatestMigration, requireCurrentSchema = false }) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Backup manifest must be a JSON object");
  }
  const checks = [
    [manifest.formatVersion === BACKUP_MANIFEST_FORMAT_VERSION, "Backup manifest formatVersion is unsupported"],
    [manifest.application === BACKUP_APPLICATION, "Backup manifest application is not DEKTA"],
    [Number.isFinite(Date.parse(String(manifest.createdAt || ""))), "Backup manifest createdAt is invalid"],
    [manifest.backupFile === basename(backupPath), "Backup manifest file name does not match the archive"],
    [Number.isSafeInteger(manifest.bytes) && manifest.bytes > 0, "Backup manifest bytes must be a positive safe integer"],
    [manifest.bytes === bytes, "Backup size does not match the manifest"],
    [/^[a-f0-9]{64}$/.test(String(manifest.sha256 || "")), "Backup manifest SHA-256 is invalid"],
    [manifest.sha256 === sha256, "Backup SHA-256 does not match the manifest"],
    [knownMigrations.includes(manifest.schemaMigration), "Backup schema migration is unknown to this DEKTA release"],
    [!requireCurrentSchema || manifest.schemaMigration === currentLatestMigration, "Backup schema is stale for the current DEKTA release"],
    [manifest.restoreTested === false, "Backup manifest must not claim an unverified restore drill"]
  ];
  for (const [condition, message] of checks) {
    if (!condition) throw new Error(message);
  }
  return manifest;
}

export function validateRestoreTarget(environment = process.env) {
  if (environment.NODE_ENV !== "staging") {
    throw new Error("Restore is restricted to NODE_ENV=staging");
  }
  if (environment.DEKTA_ALLOW_RESTORE !== "yes") {
    throw new Error("Restore is locked; set DEKTA_ALLOW_RESTORE=yes immediately before an approved restore");
  }
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required");
  let url;
  try { url = new URL(environment.DATABASE_URL); }
  catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }
  if (url.search) {
    throw new Error("Restore DATABASE_URL must not include connection query parameters; configure TLS with DEKTA_DATABASE_SSL");
  }
  const host = decodeURIComponent(url.hostname);
  if (!host || /[,\0]/.test(host) || !url.username || url.port === "0") {
    throw new Error("Restore DATABASE_URL must specify one host, a valid port, and an explicit operator username");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  // pg_restore interprets a connection string in --dbname as connection options.
  if (!/^[a-z0-9_][a-z0-9_-]{0,62}$/i.test(database)) {
    throw new Error("Restore DATABASE_URL must specify a literal PostgreSQL database name (up to 63 ASCII letters, digits, underscores or hyphens)");
  }
  const confirmation = String(environment.DEKTA_RESTORE_CONFIRM_DATABASE || "").trim();
  if (confirmation !== database) {
    throw new Error("DEKTA_RESTORE_CONFIRM_DATABASE must exactly match the recovery database name");
  }
  if (/^(postgres|template0|template1)$/i.test(database) || /(^|[_-])prod(uction)?($|[_-])/i.test(database)) {
    throw new Error("Restore target name is not permitted for a recovery drill");
  }
  return { database };
}
