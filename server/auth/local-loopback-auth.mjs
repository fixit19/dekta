const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function createLocalLoopbackAuthAdapter({ environment = "development", host = "127.0.0.1", authContext }) {
  if (!['development', 'test'].includes(environment)) {
    throw new Error("Loopback authentication is restricted to local development and tests");
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("Loopback authentication requires a loopback-only host");
  }
  if (!authContext?.organizationId || !authContext?.userId) {
    throw new Error("Loopback authentication requires an explicit synthetic tenant and user");
  }
  return async function authenticate() {
    return structuredClone(authContext);
  };
}
