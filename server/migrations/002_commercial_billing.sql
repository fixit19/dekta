BEGIN;

CREATE TABLE commercial_contracts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_id uuid NOT NULL,
  opportunity_id uuid,
  contract_number text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft','sent','signed','active','expired','cancelled')),
  currency char(3) NOT NULL DEFAULT 'IDR',
  contract_value numeric(20,2) NOT NULL CHECK (contract_value >= 0),
  valid_from date,
  valid_until date,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, contract_number, version)
);

CREATE TABLE contract_billing_plans (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contract_id uuid NOT NULL REFERENCES commercial_contracts(id),
  plan_version integer NOT NULL CHECK (plan_version > 0),
  model text NOT NULL CHECK (model IN ('one_time','milestone','recurring','usage','hybrid')),
  interval text CHECK (interval IS NULL OR interval IN ('monthly','quarterly','yearly')),
  invoice_timing text NOT NULL CHECK (invoice_timing IN ('advance','arrears')),
  cycle_amount numeric(20,2) CHECK (cycle_amount IS NULL OR cycle_amount > 0),
  cycle_count integer CHECK (cycle_count IS NULL OR cycle_count > 0),
  starts_on date NOT NULL,
  ends_on date,
  schedule_note text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, contract_id, plan_version)
);

CREATE TABLE billing_schedule_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  billing_plan_id uuid NOT NULL REFERENCES contract_billing_plans(id),
  period_key text NOT NULL,
  label text NOT NULL,
  scheduled_on date NOT NULL,
  amount numeric(20,2),
  quantity numeric(20,4),
  unit_rate numeric(20,4),
  approval_status text NOT NULL DEFAULT 'not_required' CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','drafted','issued','skipped','cancelled')),
  evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, billing_plan_id, period_key)
);

CREATE TABLE customer_invoices (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  contract_id uuid REFERENCES commercial_contracts(id),
  billing_schedule_item_id uuid REFERENCES billing_schedule_items(id),
  invoice_number text,
  status text NOT NULL CHECK (status IN ('draft','issued','partial','paid','overdue','disputed','void')),
  currency char(3) NOT NULL DEFAULT 'IDR',
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  issued_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number),
  UNIQUE (organization_id, billing_schedule_item_id)
);

CREATE INDEX commercial_contracts_org_status_idx ON commercial_contracts (organization_id, status);
CREATE INDEX billing_schedule_due_idx ON billing_schedule_items (organization_id, status, scheduled_on);
CREATE INDEX customer_invoices_org_status_due_idx ON customer_invoices (organization_id, status, due_at);

COMMIT;
