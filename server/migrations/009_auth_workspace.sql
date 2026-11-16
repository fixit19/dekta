BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS team_size text,
  ADD COLUMN IF NOT EXISTS start_mode text NOT NULL DEFAULT 'empty' CHECK (start_mode IN ('sample','empty','import')),
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending','active')),
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

CREATE TABLE auth_login_challenges (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','used','expired','locked')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_login_challenges_email_time_idx ON auth_login_challenges (email, created_at DESC);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  selected_organization_id uuid REFERENCES organizations(id),
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_user_status_idx ON auth_sessions (user_id, status, expires_at DESC);

CREATE TABLE organization_departments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  email text NOT NULL,
  roles text[] NOT NULL,
  departments text[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  inviter_user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_by_user_id uuid REFERENCES users(id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email, status)
);

CREATE INDEX organization_invitations_org_status_idx ON organization_invitations (organization_id, status, created_at DESC);

DO $tenant_security$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organization_departments', 'organization_invitations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END
$tenant_security$;

INSERT INTO plan_versions (id, code, version, name, price_amount, currency, billing_interval, status, feature_grants)
VALUES (
  '00000000-0000-4000-8000-000000000090',
  'private-beta-trial',
  1,
  'Private Beta Trial',
  0,
  'IDR',
  'month',
  'active',
  '["core.customer","core.pipeline","core.finance","addon.project_operations"]'::jsonb
)
ON CONFLICT (code, version) DO NOTHING;

COMMIT;
