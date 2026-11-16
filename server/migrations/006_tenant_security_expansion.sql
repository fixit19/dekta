BEGIN;

DO $tenant_security$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_memberships', 'subscriptions', 'entitlement_grants',
    'customer_purchase_history', 'notification_preferences', 'notification_states', 'report_schedules',
    'membership_change_requests', 'generated_documents', 'integration_connections',
    'communication_drafts', 'copilot_suggestions'
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

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY document_template_read ON document_templates
  FOR SELECT USING (
    organization_id IS NULL
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
CREATE POLICY document_template_write ON document_templates
  FOR ALL USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  ) WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );

COMMIT;
