process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { presentTenant } = require("../services/platformTenantService");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");

test("presentTenant list summary includes lightweight billing fields without ledger", () => {
  const dto = presentTenant(
    {
      id: "org-1",
      name: "North",
      slug: "north",
      status: "trial",
      is_active: true,
      subscription_plan: "professional",
      subscription_status: "trialing",
      owner_user_id: "user-1",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z"
    },
    {
      organization_id: "org-1",
      plan: "professional",
      status: "trialing",
      trial_starts_at: "2026-08-01T00:00:00.000Z",
      trial_ends_at: "2026-08-08T00:00:00.000Z",
      monthly_price_cents: 19900,
      currency: "USD",
      payment_method: "STRIPE",
      last_paid_at: null,
      next_due_at: "2026-09-01T00:00:00.000Z",
      metadata: {
        billingNotes: "secret",
        payments: [{ reference: "hidden" }]
      }
    }
  );

  assert.equal(dto.monthlyPriceCents, 19900);
  assert.equal(dto.paymentMethod, "STRIPE");
  assert.equal(dto.lastPaidAt, null);
  assert.equal(dto.nextDueAt, "2026-09-01T00:00:00.000Z");
  assert.equal(dto.trialStartsAt, "2026-08-01T00:00:00.000Z");
  assert.equal(dto.isSeedTenant, false);
  assert.equal(dto.hasFirstAdmin, true);
  assert.equal(dto.firstAdmin, null);
  assert.equal("billingNotes" in dto, false);
  assert.equal("payments" in dto, false);
  assert.equal("paymentLink" in dto, false);
});

test("presentTenant marks Team Vision as seed tenant", () => {
  const dto = presentTenant({
    id: TEAM_VISION_ORGANIZATION_ID,
    name: "Team Vision",
    status: "active",
    is_active: true
  });

  assert.equal(dto.isSeedTenant, true);
});
