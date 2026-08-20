-- BR-145 — Rollback migration 043

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_currency_check;

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_payment_method_check;

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_monthly_price_cents_check;

ALTER TABLE organization_subscriptions
  DROP COLUMN IF EXISTS next_due_at,
  DROP COLUMN IF EXISTS last_paid_at,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS monthly_price_cents,
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS trial_starts_at;
