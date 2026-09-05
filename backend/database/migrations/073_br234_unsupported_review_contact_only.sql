-- BR-234 — Allow Meta 131060 operational reviews without a prospect row.
-- Contact-only recovery. Does not grant BR-142 eligibility or promote contacts.

BEGIN;

ALTER TABLE public.unsupported_whatsapp_inbound_reviews
  ALTER COLUMN prospect_id DROP NOT NULL;

COMMENT ON COLUMN public.unsupported_whatsapp_inbound_reviews.prospect_id IS
  'Nullable for contact-only 131060 reviews (BR-234). Existing BR-156 prospect-backed rows stay populated.';

COMMIT;
