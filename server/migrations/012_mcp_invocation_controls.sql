BEGIN;

CREATE TABLE mcp_invocation_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid NOT NULL,
  integration text NOT NULL CHECK (integration = 'dekta_mcp_v1'),
  operation text NOT NULL,
  method text NOT NULL CHECK (method IN ('GET','POST')),
  decision text NOT NULL CHECK (decision IN ('allowed','rate_limited')),
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  outcome_code text,
  request_id text,
  occurred_at timestamptz NOT NULL,
  completed_at timestamptz,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE INDEX mcp_invocation_events_org_time_idx
  ON mcp_invocation_events (organization_id, occurred_at DESC);

CREATE INDEX mcp_invocation_events_allowed_window_idx
  ON mcp_invocation_events (organization_id, actor_user_id, occurred_at DESC)
  WHERE decision = 'allowed';

ALTER TABLE mcp_invocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_invocation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mcp_invocation_events
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

COMMIT;
