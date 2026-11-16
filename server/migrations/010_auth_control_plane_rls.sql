BEGIN;

-- Authentication begins before a user can have an organization context.
-- Keep these control-plane tables inaccessible to Supabase client roles while
-- allowing only the dedicated DEKTA backend role to perform the login flow.
DO $auth_control_plane$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth_login_challenges',
    'auth_sessions',
    'users',
    'organizations',
    'plan_versions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS runtime_control_plane_access ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY runtime_control_plane_access ON %I FOR ALL USING (current_user = ''dekta_app'') WITH CHECK (current_user = ''dekta_app'')',
      table_name
    );
  END LOOP;
END
$auth_control_plane$;

COMMIT;
