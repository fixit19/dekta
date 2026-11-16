import { resolve } from "node:path";

const ENVIRONMENTS = new Set(["development", "test", "staging", "production"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function required(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integer(env, name, fallback, { min, max }) {
  const raw = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(raw) || raw < min || raw > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return raw;
}

function publicUrl(env, environment) {
  const raw = String(env.DEKTA_PUBLIC_BASE_URL || "").trim();
  if (!raw) {
    if (["staging", "production"].includes(environment)) throw new Error("DEKTA_PUBLIC_BASE_URL is required outside local development");
    return null;
  }
  let url;
  try { url = new URL(raw); }
  catch { throw new Error("DEKTA_PUBLIC_BASE_URL must be an absolute URL"); }
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("DEKTA_PUBLIC_BASE_URL must contain only scheme and host");
  if (["staging", "production"].includes(environment) && url.protocol !== "https:") throw new Error("DEKTA_PUBLIC_BASE_URL must use HTTPS outside local development");
  return url.origin;
}

export function loadRuntimeConfig(env = process.env) {
  const environment = String(env.NODE_ENV || "development").trim();
  if (!ENVIRONMENTS.has(environment)) throw new Error("NODE_ENV must be development, test, staging, or production");
  const external = ["staging", "production"].includes(environment);
  const host = String(env.HOST || (external ? "0.0.0.0" : "127.0.0.1")).trim();
  const databaseSsl = String(env.DEKTA_DATABASE_SSL || "disable").trim();
  const authMode = String(env.DEKTA_AUTH_MODE || (external ? "email" : "synthetic")).trim();
  const baseUrl = publicUrl(env, environment);
  const mcpValues = [env.DEKTA_MCP_TOKEN, env.DEKTA_MCP_ORG_ID, env.DEKTA_MCP_USER_ID].map((value) => String(value || "").trim());
  const mcpConfigured = mcpValues.some(Boolean);
  const mcpPolicyConfigured = env.DEKTA_MCP_RATE_LIMIT_REQUESTS !== undefined || env.DEKTA_MCP_RATE_LIMIT_WINDOW_SECONDS !== undefined;

  if (!new Set(["disable", "require"]).has(databaseSsl)) throw new Error("DEKTA_DATABASE_SSL must be disable or require");
  if (external && databaseSsl !== "require") throw new Error("DEKTA_DATABASE_SSL=require is mandatory outside local development");
  if (external && authMode === "synthetic") throw new Error("Synthetic authentication is forbidden outside local development");
  if (!new Set(["synthetic", "email"]).has(authMode)) throw new Error("DEKTA_AUTH_MODE must be synthetic or email");
  if (authMode === "synthetic" && !LOOPBACK_HOSTS.has(host)) throw new Error("Synthetic authentication requires a loopback host");
  if (authMode === "email" && !baseUrl) throw new Error("DEKTA_PUBLIC_BASE_URL is required for email authentication");
  if (environment === "production" && env.DEKTA_PRODUCTION_APPROVED !== "yes") throw new Error("Production runtime requires DEKTA_PRODUCTION_APPROVED=yes after the production gate is approved");
  if (mcpConfigured && mcpValues.some((value) => !value)) throw new Error("DEKTA_MCP_TOKEN, DEKTA_MCP_ORG_ID, and DEKTA_MCP_USER_ID must be configured together");
  if (mcpConfigured && mcpValues[0].length < 32) throw new Error("DEKTA_MCP_TOKEN must contain at least 32 characters");
  if (mcpPolicyConfigured && !mcpConfigured) throw new Error("DEKTA MCP rate-limit settings require the MCP integration credential");

  const email = authMode === "email" ? {
    provider: String(env.DEKTA_EMAIL_PROVIDER || "resend").trim(),
    apiKey: required(env, "RESEND_API_KEY"),
    from: required(env, "DEKTA_EMAIL_FROM"),
    endpoint: String(env.DEKTA_EMAIL_ENDPOINT || "https://api.resend.com/emails").trim(),
    timeoutMs: integer(env, "DEKTA_EMAIL_TIMEOUT_MS", 8_000, { min: 1_000, max: 30_000 })
  } : null;
  if (email && email.provider !== "resend") throw new Error("Only the approved resend email adapter is implemented");
  if (email && !/^https:\/\//.test(email.endpoint)) throw new Error("DEKTA_EMAIL_ENDPOINT must use HTTPS");

  return Object.freeze({
    environment,
    host,
    port: integer(env, "PORT", 4180, { min: 1, max: 65_535 }),
    publicBaseUrl: baseUrl,
    staticRoot: resolve(String(env.DEKTA_STATIC_ROOT || "dist")),
    database: {
      url: required(env, "DATABASE_URL"),
      ssl: databaseSsl,
      sslCa: String(env.DEKTA_DATABASE_SSL_CA || "").replaceAll("\\n", "\n") || null,
      sslCaFile: String(env.DEKTA_DATABASE_SSL_CA_FILE || "").trim() || null,
      poolMax: integer(env, "DEKTA_DATABASE_POOL_MAX", 10, { min: 1, max: 50 })
    },
    auth: {
      mode: authMode,
      synthetic: authMode === "synthetic" ? {
        token: required(env, "DEKTA_SYNTHETIC_TOKEN"),
        organizationId: required(env, "DEKTA_SYNTHETIC_ORG_ID"),
        userId: required(env, "DEKTA_SYNTHETIC_USER_ID"),
        roles: String(env.DEKTA_SYNTHETIC_ROLES || "executive_admin").split(",").map((item) => item.trim()).filter(Boolean),
        entitlements: String(env.DEKTA_SYNTHETIC_ENTITLEMENTS || "addon.project_operations").split(",").map((item) => item.trim()).filter(Boolean)
      } : null
    },
    mcpIntegration: mcpConfigured ? {
      token: mcpValues[0],
      organizationId: mcpValues[1],
      userId: mcpValues[2],
      rateLimit: {
        requests: integer(env, "DEKTA_MCP_RATE_LIMIT_REQUESTS", 120, { min: 1, max: 10_000 }),
        windowSeconds: integer(env, "DEKTA_MCP_RATE_LIMIT_WINDOW_SECONDS", 60, { min: 1, max: 3_600 })
      }
    } : null,
    email,
    requestPolicy: { expectedOrigin: external ? baseUrl : null }
  });
}

export function publicRuntimeSummary(config) {
  return {
    environment: config.environment,
    host: config.host,
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    authMode: config.auth.mode,
    mcpIntegrationEnabled: Boolean(config.mcpIntegration),
    mcpRateLimit: config.mcpIntegration ? { ...config.mcpIntegration.rateLimit } : null,
    emailProvider: config.email?.provider || null,
    databaseSsl: config.database.ssl,
    databasePoolMax: config.database.poolMax,
    staticRoot: config.staticRoot
  };
}
