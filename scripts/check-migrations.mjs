import { readdir, readFile } from "node:fs/promises";

const directory = new URL("../server/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const failures = [];

files.forEach((name, index) => {
  const expected = String(index + 1).padStart(3, "0");
  if (!name.startsWith(`${expected}_`)) failures.push(`${name}: expected sequence ${expected}`);
});

const sources = new Map(await Promise.all(files.map(async (name) => [name, await readFile(new URL(name, directory), "utf8")])));
for (const [name, source] of sources) {
  if (!/^\s*BEGIN;/i.test(source) || !/COMMIT;\s*$/i.test(source)) failures.push(`${name}: migration must have explicit BEGIN/COMMIT boundaries`);
  if (/organization_memberships\s*\(\s*id\s*\)/i.test(source)) failures.push(`${name}: membership foreign key must use organization_id + user_id`);
}

const customerToCash = sources.get("005_customer_to_cash.sql") || "";
const tenantExpansion = sources.get("006_tenant_security_expansion.sql") || "";
for (const table of ["business_accounts", "sales_opportunities", "customer_projects", "customer_payments", "idempotency_keys"]) {
  if (!customerToCash.includes(`CREATE TABLE ${table}`)) failures.push(`005_customer_to_cash.sql: missing ${table}`);
}
for (const control of ["FOREIGN KEY (organization_id, account_id)", "FOREIGN KEY (organization_id, invoice_id)", "pg_advisory_xact_lock"]) {
  const body = control === "pg_advisory_xact_lock" ? await readFile(new URL("../server/repositories/postgres-customer-to-cash.mjs", import.meta.url), "utf8") : customerToCash;
  if (!body.includes(control)) failures.push(`staging foundation: missing ${control}`);
}
for (const table of ["organization_memberships", "subscriptions", "entitlement_grants", "document_templates", "communication_drafts"]) {
  if (!tenantExpansion.includes(`'${table}'`) && !tenantExpansion.includes(`ALTER TABLE ${table}`)) failures.push(`006_tenant_security_expansion.sql: missing ${table}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Migration checks passed (${files.length} ordered migrations).`);
}
