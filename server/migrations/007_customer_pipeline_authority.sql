BEGIN;

ALTER TABLE business_accounts
  ADD COLUMN source text NOT NULL DEFAULT 'Unknown',
  ADD COLUMN segment text NOT NULL DEFAULT 'Belum disegmentasi',
  ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sales_opportunities
  ADD COLUMN stage_reference text;

COMMIT;
