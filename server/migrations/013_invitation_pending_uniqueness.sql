BEGIN;

-- Keep all terminal invitation history; only an outstanding invitation is unique.
ALTER TABLE organization_invitations
  DROP CONSTRAINT organization_invitations_organization_id_email_status_key;

CREATE UNIQUE INDEX organization_invitations_pending_email_unique
  ON organization_invitations (organization_id, lower(email)) WHERE status = 'pending';

COMMIT;
