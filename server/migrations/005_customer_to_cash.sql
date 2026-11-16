BEGIN;

CREATE TABLE business_accounts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  normalized_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, normalized_name)
);

CREATE TABLE business_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_id uuid NOT NULL,
  display_name text NOT NULL,
  email_ciphertext bytea,
  phone_ciphertext bytea,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, account_id) REFERENCES business_accounts(organization_id, id)
);

CREATE TABLE sales_opportunities (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_id uuid NOT NULL,
  service text NOT NULL,
  owner_user_id uuid NOT NULL,
  stage text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','on_hold','won','lost','archived')),
  next_action text,
  next_action_due_at timestamptz,
  opportunity_value numeric(20,2) NOT NULL CHECK (opportunity_value > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  commitment_reference text,
  committed_at timestamptz,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, account_id) REFERENCES business_accounts(organization_id, id),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES organization_memberships(organization_id, user_id),
  CHECK (
    (status = 'active' AND next_action IS NOT NULL AND next_action_due_at IS NOT NULL)
    OR status <> 'active'
  ),
  CHECK (
    (status = 'won' AND commitment_reference IS NOT NULL AND committed_at IS NOT NULL)
    OR status <> 'won'
  )
);

CREATE TABLE opportunity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  opportunity_id uuid NOT NULL,
  actor_user_id uuid,
  event_type text NOT NULL,
  prior_state jsonb,
  next_state jsonb NOT NULL,
  reason text,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, opportunity_id) REFERENCES sales_opportunities(organization_id, id),
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

ALTER TABLE commercial_contracts
  ADD COLUMN title text NOT NULL DEFAULT 'Kontrak',
  ADD CONSTRAINT commercial_contracts_org_id_unique UNIQUE (organization_id, id),
  ADD CONSTRAINT commercial_contracts_account_fk FOREIGN KEY (organization_id, account_id) REFERENCES business_accounts(organization_id, id),
  ADD CONSTRAINT commercial_contracts_opportunity_fk FOREIGN KEY (organization_id, opportunity_id) REFERENCES sales_opportunities(organization_id, id);

ALTER TABLE contract_billing_plans
  ADD CONSTRAINT contract_billing_plans_org_id_unique UNIQUE (organization_id, id),
  ADD CONSTRAINT contract_billing_plans_contract_tenant_fk FOREIGN KEY (organization_id, contract_id) REFERENCES commercial_contracts(organization_id, id);

ALTER TABLE billing_schedule_items
  ADD CONSTRAINT billing_schedule_items_org_id_unique UNIQUE (organization_id, id),
  ADD CONSTRAINT billing_schedule_items_plan_tenant_fk FOREIGN KEY (organization_id, billing_plan_id) REFERENCES contract_billing_plans(organization_id, id);

ALTER TABLE customer_invoices
  ADD COLUMN account_id uuid NOT NULL,
  ADD COLUMN evidence_reference text,
  ADD CONSTRAINT customer_invoices_org_id_unique UNIQUE (organization_id, id),
  ADD CONSTRAINT customer_invoices_account_fk FOREIGN KEY (organization_id, account_id) REFERENCES business_accounts(organization_id, id),
  ADD CONSTRAINT customer_invoices_contract_tenant_fk FOREIGN KEY (organization_id, contract_id) REFERENCES commercial_contracts(organization_id, id),
  ADD CONSTRAINT customer_invoices_schedule_tenant_fk FOREIGN KEY (organization_id, billing_schedule_item_id) REFERENCES billing_schedule_items(organization_id, id);

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_membership_fk FOREIGN KEY (organization_id, actor_user_id) REFERENCES organization_memberships(organization_id, user_id);

CREATE TABLE customer_projects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  title text NOT NULL,
  owner_user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('planned','active','blocked','completed','cancelled','archived')),
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, account_id) REFERENCES business_accounts(organization_id, id),
  FOREIGN KEY (organization_id, opportunity_id) REFERENCES sales_opportunities(organization_id, id),
  FOREIGN KEY (organization_id, contract_id) REFERENCES commercial_contracts(organization_id, id),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE TABLE customer_payments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  invoice_id uuid NOT NULL,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  received_at timestamptz NOT NULL,
  evidence_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, evidence_reference),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES customer_invoices(organization_id, id)
);

CREATE TABLE idempotency_keys (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  command text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (organization_id, command, idempotency_key)
);

CREATE INDEX business_accounts_org_status_idx ON business_accounts (organization_id, status, updated_at DESC);
CREATE INDEX business_contacts_org_account_idx ON business_contacts (organization_id, account_id, status);
CREATE INDEX sales_opportunities_org_status_due_idx ON sales_opportunities (organization_id, status, next_action_due_at);
CREATE INDEX opportunity_events_org_opportunity_time_idx ON opportunity_events (organization_id, opportunity_id, occurred_at DESC);
CREATE INDEX customer_projects_org_status_due_idx ON customer_projects (organization_id, status, due_at);
CREATE INDEX customer_payments_org_invoice_time_idx ON customer_payments (organization_id, invoice_id, received_at DESC);
CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys (expires_at) WHERE expires_at IS NOT NULL;

DO $tenant_security$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'business_accounts', 'business_contacts', 'sales_opportunities', 'opportunity_events',
    'commercial_contracts', 'contract_billing_plans', 'billing_schedule_items', 'customer_invoices',
    'customer_projects', 'customer_payments', 'idempotency_keys', 'audit_events'
  ]
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

COMMIT;
