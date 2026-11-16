BEGIN;

CREATE TABLE membership_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  member_user_id uuid NOT NULL,
  previous_roles text[] NOT NULL,
  requested_roles text[] NOT NULL,
  reason text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','applied','cancelled')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, member_user_id) REFERENCES organization_memberships(organization_id, user_id),
  FOREIGN KEY (organization_id, requested_by) REFERENCES organization_memberships(organization_id, user_id),
  FOREIGN KEY (organization_id, reviewed_by) REFERENCES organization_memberships(organization_id, user_id)
);

CREATE TABLE document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  template_type text NOT NULL CHECK (template_type IN ('proposal','contract','invoice_cover')),
  name text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  required_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, version)
);

CREATE TABLE generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  template_id uuid NOT NULL REFERENCES document_templates(id),
  source_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  variable_snapshot jsonb NOT NULL,
  rendered_object_key text,
  rendered_checksum text,
  status text NOT NULL CHECK (status IN ('draft','in_review','approved','sent','signed','void')),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id, version)
);

CREATE TABLE integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  integration_kind text NOT NULL CHECK (integration_kind IN ('accounting','payment','email','whatsapp')),
  provider text NOT NULL,
  external_reference text NOT NULL,
  secret_reference text,
  status text NOT NULL CHECK (status IN ('not_connected','verification_required','connected','degraded','disabled')),
  verified_at timestamptz,
  configured_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_kind)
);

CREATE TABLE communication_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient_ciphertext bytea NOT NULL,
  consent_reference text NOT NULL,
  template_version text,
  body_ciphertext bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','approved','queued','sent','failed','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE copilot_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  contract_version text NOT NULL,
  suggestion jsonb NOT NULL,
  evidence jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('awaiting_human_review','approved_for_manual_action','dismissed','expired')),
  reviewed_by uuid REFERENCES users(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX membership_change_org_status_idx ON membership_change_requests (organization_id, status, created_at DESC);
CREATE INDEX generated_documents_org_source_idx ON generated_documents (organization_id, source_type, source_entity_id, created_at DESC);
CREATE INDEX communication_drafts_org_status_idx ON communication_drafts (organization_id, status, created_at DESC);
CREATE INDEX copilot_suggestions_org_status_idx ON copilot_suggestions (organization_id, status, created_at DESC);

COMMIT;
