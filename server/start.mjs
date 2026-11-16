import { access } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { AuthWorkspaceService } from "./application/auth-workspace-service.mjs";
import { createCustomerToCashService } from "./application/customer-to-cash-service.mjs";
import { McpInvocationControl } from "./application/mcp-invocation-control.mjs";
import { createSessionAuthAdapter, credentialsFromRequest } from "./auth/session-auth.mjs";
import { createIntegrationAuthAdapter } from "./auth/integration-auth.mjs";
import { createSyntheticAuthAdapter } from "./auth/synthetic-auth.mjs";
import { loadRuntimeConfig, publicRuntimeSummary } from "./config/runtime-config.mjs";
import { postgresConnectionOptions } from "./config/postgres-connection.mjs";
import { createApiHandler } from "./http/api.mjs";
import { createApplicationHandler } from "./http/application-handler.mjs";
import { createNodeServer } from "./http/node-server.mjs";
import { createRequestPolicyHandler } from "./http/request-policy.mjs";
import { createStaticAppHandler } from "./http/static-app.mjs";
import { createResendTransactionalEmail } from "./integrations/resend-transactional-email.mjs";
import { PostgresAuthWorkspaceRepository } from "./repositories/postgres-auth-workspace.mjs";
import { PostgresCustomerToCashRepository } from "./repositories/postgres-customer-to-cash.mjs";
import { PostgresMcpInvocationRepository } from "./repositories/postgres-mcp-invocation.mjs";
import { latestMigrationName } from "../scripts/lib/backup-contract.mjs";

const config = loadRuntimeConfig();
const requiredMigration = await latestMigrationName();
await access(resolve(config.staticRoot, "index.html"));

function log(record) {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), service: "dekta", ...record })}\n`);
}

const connectionOptions = await postgresConnectionOptions(config.database);
const pool = new pg.Pool({ ...connectionOptions, max: config.database.poolMax, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
pool.on("error", (error) => log({ level: "error", event: "database_pool_error", error: error.name }));

const service = createCustomerToCashService({ repository: new PostgresCustomerToCashRepository(pool) });
const authRepository = new PostgresAuthWorkspaceRepository(pool);
let identity = null;
let authenticate;
const integrationAuthenticate = config.mcpIntegration ? createIntegrationAuthAdapter({
  ...config.mcpIntegration,
  resolveContext: ({ organizationId, userId }) => authRepository.loadIntegrationContext(organizationId, userId)
}) : async () => null;
const integrationControl = config.mcpIntegration ? new McpInvocationControl({
  repository: new PostgresMcpInvocationRepository(pool),
  limit: config.mcpIntegration.rateLimit.requests,
  windowSeconds: config.mcpIntegration.rateLimit.windowSeconds
}) : null;

if (config.auth.mode === "email") {
  const delivery = createResendTransactionalEmail({
    apiKey: config.email.apiKey,
    from: config.email.from,
    publicBaseUrl: config.publicBaseUrl,
    endpoint: config.email.endpoint,
    timeoutMs: config.email.timeoutMs
  });
  identity = new AuthWorkspaceService({ repository: authRepository, environment: config.environment, delivery });
  identity.credentialsFromRequest = credentialsFromRequest;
  const sessionAuthenticate = createSessionAuthAdapter({ service: identity });
  authenticate = async (request) => (await integrationAuthenticate(request)) || sessionAuthenticate(request);
} else {
  const syntheticAuthenticate = createSyntheticAuthAdapter({ ...config.auth.synthetic, environment: config.environment });
  authenticate = async (request) => (await integrationAuthenticate(request)) || syntheticAuthenticate(request);
}

const api = createApiHandler({
  service,
  authenticate,
  identity,
  integrationControl,
  logger: log,
  ready: async () => {
    try {
      const result = await pool.query("SELECT name FROM schema_migrations WHERE name = $1", [requiredMigration]);
      return result.rowCount === 1;
    } catch (error) {
      log({ level: "error", event: "readiness_failed", error: error.name, code: error.code || null });
      return false;
    }
  }
});
const staticApp = createStaticAppHandler({ root: config.staticRoot });
const application = createApplicationHandler({ api, staticApp });
const guarded = createRequestPolicyHandler({ handler: application, expectedOrigin: config.requestPolicy.expectedOrigin });
const server = createNodeServer(guarded, { logger: log, exposeErrorDetails: config.environment === "development", httpsOnly: ["staging", "production"].includes(config.environment) });

server.listen(config.port, config.host, () => log({ level: "info", event: "runtime_started", ...publicRuntimeSummary(config) }));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log({ level: "info", event: "runtime_shutdown_started", signal });
  const forced = setTimeout(() => process.exit(1), 10_000);
  forced.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(forced);
    log({ level: "info", event: "runtime_shutdown_complete", signal });
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
