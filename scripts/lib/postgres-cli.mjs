import { spawn } from "node:child_process";

export function postgresCliEnvironment(databaseUrl, source = process.env) {
  const ssl = String(source.DEKTA_DATABASE_SSL || "disable").trim();
  if (!["disable", "require"].includes(ssl)) throw new Error("DEKTA_DATABASE_SSL must be disable or require");
  let url;
  try { url = new URL(databaseUrl); }
  catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  if (url.search) throw new Error("DATABASE_URL must not include connection query parameters; configure TLS with DEKTA_DATABASE_SSL");
  const host = decodeURIComponent(url.hostname);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!host || /[,\0]/.test(host) || !url.username || url.port === "0") {
    throw new Error("DATABASE_URL must specify one host, a valid port, and an explicit operator username");
  }
  if (!/^[a-z0-9_][a-z0-9_-]{0,62}$/i.test(database)) {
    throw new Error("DATABASE_URL must specify a literal PostgreSQL database name (up to 63 ASCII letters, digits, underscores or hyphens)");
  }
  // These libpq settings can redirect a connection despite explicit PGHOST/PGDATABASE.
  const { PGHOSTADDR: _hostAddress, PGSERVICE: _service, ...base } = source;
  const environment = {
    ...base,
    DEKTA_DATABASE_SSL: ssl,
    PGHOST: host,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database
  };
  if (ssl === "require") {
    environment.PGSSLMODE = "verify-full";
    if (source.DEKTA_DATABASE_SSL_CA_FILE) environment.PGSSLROOTCERT = source.DEKTA_DATABASE_SSL_CA_FILE;
  } else {
    environment.PGSSLMODE = "disable";
  }
  return environment;
}

export function runCommand(command, args, { env = process.env, inheritOutput = true, input } = {}) {
  return new Promise((resolve, reject) => {
    const output = inheritOutput ? "inherit" : "pipe";
    const child = spawn(command, args, { env, stdio: [input === undefined ? "ignore" : "pipe", output, output] });
    let stdout = "";
    let stderr = "";
    let inputError;
    child.stdin?.on("error", (error) => { inputError = error; });
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => reject(new Error(`${command} could not start: ${error.message}`)));
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      if (inputError) return reject(new Error(`${command} could not receive its input: ${inputError.code}`));
      resolve({ stdout, stderr });
    });
    child.stdin?.end(input);
  });
}
