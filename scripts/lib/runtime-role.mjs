export async function provisionRuntimeRole(client, password) {
  if (password.length < 24) throw new Error("DEKTA_APP_DATABASE_PASSWORD must contain at least 24 characters");
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'dekta_app'");
  if (exists.rowCount === 0) {
    await client.query("CREATE ROLE dekta_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  }
  const role = await client.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, EXISTS (SELECT 1 FROM pg_auth_members WHERE member = pg_roles.oid) AS memberships FROM pg_roles WHERE rolname = 'dekta_app'");
  if (Object.values(role.rows[0]).some(Boolean)) throw new Error("Existing dekta_app role has elevated privileges or memberships; review and remove them before provisioning");
  const passwordStatement = await client.query("SELECT format('ALTER ROLE dekta_app PASSWORD %L', $1::text) AS sql", [password]);
  await client.query(passwordStatement.rows[0].sql);
  await client.query("ALTER ROLE dekta_app SET statement_timeout = '15s'");
  await client.query("ALTER ROLE dekta_app SET idle_in_transaction_session_timeout = '15s'");
  const connectStatement = await client.query("SELECT format('GRANT CONNECT ON DATABASE %I TO dekta_app', current_database()) AS sql");
  await client.query(connectStatement.rows[0].sql);
  await client.query("GRANT USAGE ON SCHEMA public TO dekta_app");
  await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dekta_app");
  await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dekta_app");
  await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dekta_app");
  await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dekta_app");
  const ledger = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present");
  if (ledger.rows[0].present) {
    await client.query("REVOKE INSERT, UPDATE, DELETE ON public.schema_migrations FROM dekta_app");
    await client.query("DROP POLICY IF EXISTS dekta_runtime_migration_read ON public.schema_migrations");
    await client.query("CREATE POLICY dekta_runtime_migration_read ON public.schema_migrations FOR SELECT TO dekta_app USING (true)");
  }
}
