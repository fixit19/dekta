BEGIN;

CREATE INDEX auth_login_challenges_created_at_idx
  ON auth_login_challenges (created_at DESC);

COMMIT;
