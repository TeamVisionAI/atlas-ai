import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEAM_VISION_ORGANIZATION_ID,
  billingPatchOmitsOrganizationId,
  buildBillingPatch,
  buildExtendTrialPayload,
  buildMarkPaidPayload,
  canShowExtendTrial,
  countLifecycleStatuses,
  filterTenantsByLifecycle,
  formatLifecycleBadge,
  isPastDue,
  isSeedTenant,
  mergeTenantWithBilling,
  paymentDueBannerVisible,
  shouldShowStripeField,
  shouldShowZelleField,
  showSuspendedMarkPaidWarning,
  trialDaysRemaining,
  trialDueLabel,
  trialExtensionCapacityRemaining
} from "./platformBillingHelpers.js";
import {
  canAccessBillingSettings,
  canEditTenantBillingPage
} from "../../security/billingSettingsAccess.js";
import { canAccessRecruitingSettings } from "../../security/recruitingConfigAccess.js";
import {
  TENANT_LIFECYCLE_STATUSES,
  canAccessPlatformTenantsPage,
  requiresReactivateConfirmation,
  requiresSuspendConfirmation
} from "../../security/platformAccess.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrc = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(frontendSrc, relativePath), "utf8");
}

const now = new Date("2026-08-20T12:00:00.000Z");

const tenants = [
  {
    id: TEAM_VISION_ORGANIZATION_ID,
    name: "Team Vision",
    isSeedTenant: true,
    lifecycleStatus: "ACTIVE",
    plan: "professional",
    paymentMethod: "MANUAL",
    lastPaidAt: "2026-08-01T00:00:00.000Z"
  },
  {
    id: "org-trial",
    name: "Trial Co",
    lifecycleStatus: "TRIAL",
    trialStartsAt: "2026-08-18T00:00:00.000Z",
    trialEndsAt: "2026-08-25T00:00:00.000Z",
    paymentMethod: "STRIPE"
  },
  {
    id: "org-active",
    name: "Active Co",
    lifecycleStatus: "ACTIVE",
    nextDueAt: "2026-09-01T00:00:00.000Z",
    lastPaidAt: "2026-08-01T00:00:00.000Z",
    paymentMethod: "ZELLE"
  },
  {
    id: "org-past",
    name: "Past Due Co",
    lifecycleStatus: "PAST_DUE",
    trialEndsAt: "2026-08-10T00:00:00.000Z",
    nextDueAt: "2026-08-10T00:00:00.000Z"
  },
  {
    id: "org-susp",
    name: "Suspended Co",
    lifecycleStatus: "SUSPENDED"
  },
  {
    id: "org-nomethod",
    name: "No Method Co",
    lifecycleStatus: "ACTIVE"
  }
];

const adminUser = { role: "administrator", saasRole: "ADMIN" };
const rvpUser = { role: "rvp", saasRole: "RVP" };
const superAdminUser = { role: "administrator", saasRole: "SUPER_ADMIN", isSuperAdmin: true };

describe("platform billing dashboard helpers", () => {
  it("1. All filter", () => {
    assert.equal(filterTenantsByLifecycle(tenants, "ALL").length, tenants.length);
  });

  it("2. Trial filter", () => {
    assert.deepEqual(
      filterTenantsByLifecycle(tenants, "TRIAL").map((row) => row.id),
      ["org-trial"]
    );
  });

  it("3. Active filter", () => {
    assert.equal(filterTenantsByLifecycle(tenants, "ACTIVE").length, 3);
  });

  it("4. Past Due filter", () => {
    assert.equal(filterTenantsByLifecycle(tenants, "PAST_DUE").length, 1);
  });

  it("5. Suspended filter", () => {
    assert.equal(filterTenantsByLifecycle(tenants, "SUSPENDED").length, 1);
  });

  it("6. status counts", () => {
    assert.deepEqual(countLifecycleStatuses(tenants), {
      ALL: 6,
      TRIAL: 1,
      ACTIVE: 3,
      PAST_DUE: 1,
      SUSPENDED: 1
    });
  });

  it("7. trial days remaining", () => {
    assert.equal(trialDaysRemaining("2026-08-25T00:00:00.000Z", now), 5);
    assert.match(trialDueLabel(tenants[1], now), /5 days remaining/);
  });

  it("8. overdue state", () => {
    assert.equal(isPastDue(tenants[3]), true);
    assert.match(trialDueLabel(tenants[3], now), /Past due/);
    assert.equal(formatLifecycleBadge("PAST_DUE"), "PAST DUE");
  });

  it("9. billing panel GET", () => {
    const panel = readSrc("pages/platform/TenantBillingPanel.jsx");
    const service = readSrc("services/platformService.js");
    assert.match(panel, /getTenantBilling/);
    assert.match(service, /\/api\/platform\/tenants\/\$\{id\}\/billing/);
  });

  it("10. billing PATCH", () => {
    const panel = readSrc("pages/platform/TenantBillingPanel.jsx");
    const service = readSrc("services/platformService.js");
    assert.match(panel, /updateTenantBilling/);
    assert.match(service, /method: "PATCH"/);
  });

  it("11. PATCH sends no organizationId", () => {
    const payload = buildBillingPatch({
      plan: "professional",
      monthlyPrice: "199.00",
      currency: "USD",
      paymentMethod: "STRIPE",
      paymentLink: "https://pay.example",
      nextDueAt: "2026-09-01"
    });
    assert.equal(billingPatchOmitsOrganizationId(payload), true);
    assert.equal("organizationId" in payload, false);
  });

  it("12. Stripe conditional field", () => {
    assert.deepEqual(shouldShowStripeField("STRIPE"), { visible: true, readOnly: false });
    assert.equal(shouldShowStripeField("ZELLE").visible, false);
  });

  it("13. Zelle conditional field", () => {
    assert.deepEqual(shouldShowZelleField("ZELLE"), { visible: true, readOnly: false });
    assert.equal(shouldShowZelleField("STRIPE").visible, false);
  });

  it("14. Manual conditional UX", () => {
    assert.equal(shouldShowStripeField("MANUAL").visible, false);
    assert.equal(shouldShowZelleField("MANUAL").visible, false);
    assert.deepEqual(shouldShowStripeField("MANUAL", "https://saved"), {
      visible: true,
      readOnly: true
    });
  });

  it("15. Extend Trial hidden for Team Vision", () => {
    assert.equal(canShowExtendTrial(tenants[0]), false);
    assert.equal(isSeedTenant(tenants[0]), true);
  });

  it("16. Extend Trial works for TRIAL tenant", () => {
    assert.equal(canShowExtendTrial(tenants[1]), true);
    assert.deepEqual(buildExtendTrialPayload(2, 3), { days: 2 });
  });

  it("17. max trial capacity displayed", () => {
    assert.equal(
      trialExtensionCapacityRemaining("2026-08-18T00:00:00.000Z", "2026-08-25T00:00:00.000Z"),
      3
    );
    assert.match(readSrc("pages/platform/TenantBillingPanel.jsx"), /trial-capacity/);
  });

  it("18. Mark Paid form", () => {
    const payload = buildMarkPaidPayload({
      amountDollars: "199.00",
      reference: "zelle-1",
      paidAt: "2026-08-19",
      notes: "wired"
    });
    assert.equal(payload.amountCents, 19900);
    assert.equal(payload.reference, "zelle-1");
    assert.match(readSrc("pages/platform/TenantBillingPanel.jsx"), /data-testid="billing-mark-paid"/);
  });

  it("19. suspended payment warning", () => {
    assert.equal(showSuspendedMarkPaidWarning("SUSPENDED"), true);
    assert.equal(showSuspendedMarkPaidWarning("TRIAL"), false);
    const panel = readSrc("pages/platform/TenantBillingPanel.jsx");
    assert.match(panel, /SUSPENDED_MARK_PAID_WARNING/);
    assert.match(panel, /billing-suspended-warning/);
    assert.match(
      readSrc("pages/platform/platformBillingHelpers.js"),
      /Recording this payment will not reactivate the tenant/
    );
  });

  it("20. lifecycle refresh after Mark Paid", () => {
    const updated = mergeTenantWithBilling(
      { id: "org-trial", lifecycleStatus: "TRIAL" },
      { lifecycleStatus: "ACTIVE", lastPaidAt: "2026-08-20T00:00:00.000Z" }
    );
    assert.equal(updated.lifecycleStatus, "ACTIVE");
    assert.match(readSrc("pages/platform/TenantBillingPanel.jsx"), /onTenantUpdated/);
    assert.match(readSrc("pages/platform/PlatformTenantsPage.jsx"), /applyTenantUpdate/);
  });

  it("21. Team Vision Seed Tenant badge", () => {
    assert.match(readSrc("pages/platform/PlatformTenantsPage.jsx"), /Seed Tenant/);
    assert.match(readSrc("pages/platform/PlatformTenantsPage.jsx"), /data-testid="seed-tenant-badge"/);
  });

  it("22. tenant read-only billing route", () => {
    assert.match(readSrc("App.jsx"), /path="billing"\s+element=\{<BillingConfiguration/);
    assert.match(readSrc("config/workspaceExperience.js"), /"settings\/billing"/);
    assert.match(readSrc("config/workspaceExperience.js"), /id:\s*"billing"/);
  });

  it("23. PAST_DUE tenant banner", () => {
    assert.equal(paymentDueBannerVisible({ lifecycleStatus: "PAST_DUE" }), true);
    assert.match(
      readSrc("pages/configuration/BillingConfiguration.jsx"),
      /tenant-billing-payment-due/
    );
    assert.match(readSrc("pages/configuration/BillingConfiguration.jsx"), /billingConfigPaymentDue/);
  });

  it("24. tenant admin cannot edit", () => {
    assert.equal(canEditTenantBillingPage(adminUser), false);
    const page = readSrc("pages/configuration/BillingConfiguration.jsx");
    assert.doesNotMatch(page, /Mark Paid/);
    assert.doesNotMatch(page, /Extend Trial/);
    assert.doesNotMatch(page, /updateTenantBilling/);
    assert.doesNotMatch(page, /billingNotes/);
  });

  it("25. RVP access behavior correct", () => {
    assert.equal(canAccessBillingSettings(rvpUser), false);
    assert.equal(canAccessBillingSettings(adminUser), true);
  });

  it("26. Platform/Super Admin still works", () => {
    assert.equal(canAccessPlatformTenantsPage(superAdminUser), true);
    assert.equal(canAccessBillingSettings(superAdminUser), true);
    assert.ok(TENANT_LIFECYCLE_STATUSES.includes("PAST_DUE"));
    assert.equal(requiresSuspendConfirmation("SUSPENDED"), true);
    assert.equal(requiresReactivateConfirmation("SUSPENDED", "ACTIVE"), true);
  });

  it("27. Recruiting Settings unchanged", () => {
    assert.equal(canAccessRecruitingSettings(adminUser), true);
    assert.equal(canAccessRecruitingSettings(rvpUser), false);
    assert.match(readSrc("App.jsx"), /path="recruiting"\s+element=\{<RecruitingConfiguration/);
  });

  it("28. Meta Review not reintroduced", () => {
    const app = readSrc("App.jsx");
    const experience = readSrc("config/workspaceExperience.js");
    assert.doesNotMatch(app, /MetaReview/);
    assert.doesNotMatch(app, /meta-review/);
    assert.doesNotMatch(experience, /meta-review/);
    assert.doesNotMatch(experience, /Meta Review/);
  });
});
