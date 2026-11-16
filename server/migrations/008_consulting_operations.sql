BEGIN;

CREATE TABLE consulting_engagements (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_id uuid NOT NULL,
  title text NOT NULL,
  reference text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  manager_user_id uuid NOT NULL,
  pricing_model text NOT NULL CHECK (pricing_model IN ('fixed_fee','retainer','milestone','hourly')),
  contract_value numeric(20,2) NOT NULL DEFAULT 0 CHECK (contract_value >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  target_at timestamptz NOT NULL,
  next_milestone text NOT NULL,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, reference),
  FOREIGN KEY (organization_id, account_id) REFERENCES business_accounts(organization_id, id),
  FOREIGN KEY (organization_id, manager_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE TABLE consulting_workstreams (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  owner_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','blocked','done')),
  dependency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, engagement_id, normalized_name),
  FOREIGN KEY (organization_id, engagement_id) REFERENCES consulting_engagements(organization_id, id),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE TABLE consulting_milestones (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  workstream_id uuid NOT NULL,
  title text NOT NULL,
  weight integer NOT NULL CHECK (weight BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  due_at timestamptz,
  completed_at timestamptz,
  evidence text,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, engagement_id) REFERENCES consulting_engagements(organization_id, id),
  FOREIGN KEY (organization_id, workstream_id) REFERENCES consulting_workstreams(organization_id, id),
  CHECK ((status = 'done' AND completed_at IS NOT NULL AND evidence IS NOT NULL) OR status = 'open')
);

CREATE TABLE consulting_tasks (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  workstream_id uuid NOT NULL,
  title text NOT NULL,
  owner_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','active','blocked','done','cancelled')),
  due_at timestamptz NOT NULL,
  blocker text,
  completed_at timestamptz,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, engagement_id) REFERENCES consulting_engagements(organization_id, id),
  FOREIGN KEY (organization_id, workstream_id) REFERENCES consulting_workstreams(organization_id, id),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES organization_memberships(organization_id, user_id),
  CHECK ((status = 'blocked' AND blocker IS NOT NULL) OR status <> 'blocked'),
  CHECK ((status = 'done' AND completed_at IS NOT NULL) OR status <> 'done')
);

CREATE TABLE consulting_task_comments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  task_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  author_user_id uuid NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, engagement_id) REFERENCES consulting_engagements(organization_id, id),
  FOREIGN KEY (organization_id, task_id) REFERENCES consulting_tasks(organization_id, id),
  FOREIGN KEY (organization_id, author_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE TABLE consulting_notification_intents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  comment_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel = 'in_app'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','read','cancelled')),
  external_delivery boolean NOT NULL DEFAULT false CHECK (external_delivery = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, comment_id) REFERENCES consulting_task_comments(organization_id, id),
  FOREIGN KEY (organization_id, recipient_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE TABLE consulting_assignment_handoffs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  task_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_acceptance' CHECK (status IN ('awaiting_acceptance','accepted','rejected')),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  reason text NOT NULL,
  evidence text NOT NULL,
  due_at timestamptz NOT NULL,
  submitted_by_user_id uuid NOT NULL,
  submitted_at timestamptz NOT NULL,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, engagement_id) REFERENCES consulting_engagements(organization_id, id),
  FOREIGN KEY (organization_id, task_id) REFERENCES consulting_tasks(organization_id, id),
  FOREIGN KEY (organization_id, from_user_id) REFERENCES organization_memberships(organization_id, user_id),
  FOREIGN KEY (organization_id, to_user_id) REFERENCES organization_memberships(organization_id, user_id),
  FOREIGN KEY (organization_id, submitted_by_user_id) REFERENCES organization_memberships(organization_id, user_id),
  FOREIGN KEY (organization_id, reviewed_by_user_id) REFERENCES organization_memberships(organization_id, user_id),
  CHECK (from_user_id <> to_user_id),
  CHECK ((status = 'awaiting_acceptance' AND reviewed_at IS NULL) OR (status <> 'awaiting_acceptance' AND reviewed_at IS NOT NULL AND review_note IS NOT NULL))
);

CREATE UNIQUE INDEX consulting_one_pending_handoff_per_task_idx
  ON consulting_assignment_handoffs (organization_id, task_id)
  WHERE status = 'awaiting_acceptance';

CREATE TABLE consulting_expenses (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  workstream_id uuid NOT NULL,
  task_id uuid NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  paid_by text NOT NULL,
  treatment text NOT NULL CHECK (treatment IN ('company_cost','included_in_fee','employee_reimbursement','supplier_payable','client_rebillable')),
  evidence_reference text NOT NULL,
  incurred_at timestamptz NOT NULL,
  submitted_by_user_id uuid NOT NULL,
  submitted_at timestamptz NOT NULL,
  finance_state text NOT NULL DEFAULT 'awaiting_review' CHECK (finance_state IN ('awaiting_review','approved','rejected')),
  billing_state text NOT NULL DEFAULT 'not_applicable' CHECK (billing_state IN ('not_applicable','ready_for_invoice_draft')),
  settlement_state text NOT NULL DEFAULT 'not_posted' CHECK (settlement_state IN ('not_posted','awaiting_reimbursement','awaiting_supplier_payment','approved_cost')),
  external_posting boolean NOT NULL DEFAULT false CHECK (external_posting = false),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_note text,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, evidence_reference),
  FOREIGN KEY (organization_id, engagement_id) REFERENCES consulting_engagements(organization_id, id),
  FOREIGN KEY (organization_id, workstream_id) REFERENCES consulting_workstreams(organization_id, id),
  FOREIGN KEY (organization_id, task_id) REFERENCES consulting_tasks(organization_id, id),
  FOREIGN KEY (organization_id, submitted_by_user_id) REFERENCES organization_memberships(organization_id, user_id),
  FOREIGN KEY (organization_id, reviewed_by_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE INDEX consulting_engagement_org_status_idx ON consulting_engagements (organization_id, status, target_at);
CREATE INDEX consulting_workstream_engagement_idx ON consulting_workstreams (organization_id, engagement_id, status);
CREATE INDEX consulting_milestone_workstream_idx ON consulting_milestones (organization_id, workstream_id, status);
CREATE INDEX consulting_task_workstream_due_idx ON consulting_tasks (organization_id, workstream_id, status, due_at);
CREATE INDEX consulting_comment_task_time_idx ON consulting_task_comments (organization_id, task_id, created_at);
CREATE INDEX consulting_expense_finance_idx ON consulting_expenses (organization_id, finance_state, incurred_at);

DO $tenant_security$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'consulting_engagements', 'consulting_workstreams', 'consulting_milestones', 'consulting_tasks',
    'consulting_task_comments', 'consulting_notification_intents', 'consulting_assignment_handoffs', 'consulting_expenses'
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
