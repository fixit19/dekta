import { resolve } from "node:path";
import process from "node:process";
import { AuthWorkspaceService } from "../server/application/auth-workspace-service.mjs";
import { createCustomerToCashService } from "../server/application/customer-to-cash-service.mjs";
import { createSessionAuthAdapter, credentialsFromRequest } from "../server/auth/session-auth.mjs";
import { createApiHandler } from "../server/http/api.mjs";
import { createApplicationHandler } from "../server/http/application-handler.mjs";
import { createNodeServer } from "../server/http/node-server.mjs";
import { createStaticAppHandler } from "../server/http/static-app.mjs";
import { LOCAL_AUTH_CONTEXT, createPGlitePool, openLocalDatabase } from "../server/platform/pglite-local.mjs";
import { PostgresAuthWorkspaceRepository } from "../server/repositories/postgres-auth-workspace.mjs";
import { PostgresCustomerToCashRepository } from "../server/repositories/postgres-customer-to-cash.mjs";
import { latestMigrationName } from "./lib/backup-contract.mjs";

const environment = process.env.NODE_ENV || "development";
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const dataDirectory = resolve(process.env.DEKTA_LOCAL_DATA_DIR || ".growth-os-local/pglite");
const requiredMigration = await latestMigrationName();
const db = await openLocalDatabase(dataDirectory);
const pool = createPGlitePool(db);
const repository = new PostgresCustomerToCashRepository(pool);
const service = createCustomerToCashService({ repository });
const identity = new AuthWorkspaceService({ repository: new PostgresAuthWorkspaceRepository(pool), environment });
identity.credentialsFromRequest = credentialsFromRequest;
const authenticate = createSessionAuthAdapter({ service: identity });
const api = createApiHandler({
  service,
  authenticate,
  identity,
  ready: async () => (await db.query("SELECT checksum FROM schema_migrations WHERE name = $1", [requiredMigration])).rows.length === 1
});
const staticApp = createStaticAppHandler({ root: new URL("../public/", import.meta.url) });
const server = createNodeServer(createApplicationHandler({ api, staticApp }));

server.listen(port, host, () => {
  console.log(`DEKTA local full stack available at http://localhost:${port}`);
  console.log(`Persistent local database: ${dataDirectory}`);
  console.log("Local email codes are shown only in the browser; no email is sent.");
});

async function shutdown(signal) {
  console.log(`DEKTA local full stack received ${signal}; shutting down`);
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
