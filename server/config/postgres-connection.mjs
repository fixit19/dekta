import { readFile } from "node:fs/promises";

// DEKTA's TLS policy must not be replaced by pg's connection-string parser.
export async function postgresConnectionOptions({ url, ssl = "disable", sslCa = null, sslCaFile = null }) {
  let parsed;
  try { parsed = new URL(url); }
  catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  if (!["disable", "require"].includes(ssl)) throw new Error("DEKTA_DATABASE_SSL must be disable or require");
  for (const name of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) parsed.searchParams.delete(name);
  const ca = sslCa || (sslCaFile ? await readFile(sslCaFile, "utf8") : null);
  return {
    connectionString: parsed.toString(),
    ssl: ssl === "require" ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false
  };
}

export function postgresSettingsFromEnvironment(env = process.env, defaultSsl = "disable") {
  return {
    url: env.DATABASE_URL,
    ssl: String(env.DEKTA_DATABASE_SSL || defaultSsl).trim(),
    sslCa: env.DEKTA_DATABASE_SSL_CA?.replaceAll("\\n", "\n") || null,
    sslCaFile: env.DEKTA_DATABASE_SSL_CA_FILE || null
  };
}
