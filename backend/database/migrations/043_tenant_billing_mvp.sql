-- BR-145 — SaaS tenant billing MVP (trial dates, manual payment fields)
-- Migration 043

ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS trial_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monthly_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS last_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_due_at TIMESTAMPTZ;

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_monthly_price_cents_check;

ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_monthly_price_cents_check
  CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0);

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_payment_method_check;

ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('STRIPE', 'ZELLE', 'MANUAL')
  );

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_currency_check;

ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');

-- Team Vision: grandfather as ACTIVE with no trial window.
UPDATE organization_subscriptions os
SET
  trial_starts_at = NULL,
  trial_ends_at = NULL,
  currency = COALESCE(os.currency, 'USD'),
  updated_at = now()
WHERE os.organization_id = '00000000-0000-4000-8000-000000000001';

UPDATE organizations
SET
  status = 'active',
  subscription_status = 'active',
  is_active = true,
  updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000001';

-- Existing TRIAL tenants: anchor trial window to org creation (may become PAST_DUE if already expired).
UPDATE organization_subscriptions os
SET
  trial_starts_at = COALESCE(os.trial_starts_at, o.created_at),
  trial_ends_at = COALESCE(
    os.trial_ends_at,
    o.created_at + INTERVAL '7 days'
  ),
  currency = COALESCE(os.currency, 'USD'),
  updated_at = now()
FROM organizations o
WHERE o.id = os.organization_id
  AND o.id <> '00000000-0000-4000-8000-000000000001'
  AND (
    lower(o.status) = 'trial'
    OR lower(o.subscription_status) = 'trial'
    OR lower(os.status) = 'trial'
  );

COMMENT ON COLUMN organization_subscriptions.trial_starts_at IS 'BR-145 — trial window start';
COMMENT ON COLUMN organization_subscriptions.trial_ends_at IS 'BR-145 — trial window end (max 10 days from start)';
