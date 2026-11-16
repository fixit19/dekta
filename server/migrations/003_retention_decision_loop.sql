BEGIN;

CREATE TABLE customer_purchase_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_id uuid NOT NULL,
  product_or_service text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'IDR',
  amount numeric(20,2) NOT NULL CHECK (amount >= 0),
  completed_at timestamptz NOT NULL,
  reorder_cycle_days integer CHECK (reorder_cycle_days IS NULL OR reorder_cycle_days > 0),
  source_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_reference)
);

CREATE TABLE notification_preferences (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  notification_type text NOT NULL CHECK (notification_type IN ('followup','invoice','contract','project','repeat')),
  in_app_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, notification_type)
);

CREATE TABLE notification_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  notification_key text NOT NULL,
  source_type text NOT NULL,
  source_entity_id text NOT NULL,
  read_at timestamptz,
  snoozed_until timestamptz,
  escalated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, notification_key)
);

CREATE TABLE report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly')),
  filter_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_mode text NOT NULL DEFAULT 'in_app_only' CHECK (delivery_mode IN ('in_app_only','external_gated')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchase_history_org_account_time_idx ON customer_purchase_history (organization_id, account_id, completed_at DESC);
CREATE INDEX notification_states_org_user_idx ON notification_states (organization_id, user_id, updated_at DESC);
CREATE INDEX report_schedules_org_status_idx ON report_schedules (organization_id, status);

COMMIT;
