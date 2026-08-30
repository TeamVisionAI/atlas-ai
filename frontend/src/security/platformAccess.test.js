/**
 * SaaS Phase B — Super Admin platform UI contracts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSuperAdminUser } from "./isSuperAdminUser.js";
import {
  assignTenantAdminPath,
  buildAssignTenantAdminPayload,
  buildCreateTenantPayload,
  buildEnterSupportModePayload,
  buildUpdateTenantStatusPayload,
  canAccessPlatformTenantsPage,
  canEnterSupportMode,
  DEFAULT_CREATE_TENANT_STATUS,
  isSupportModeBannerVisible,
  isTenantSuspended,
  requiresReactivateConfirmation,
  requiresSuspendConfirmation,
  shouldConfirmSupportModeSwitch,
  shouldShowPlatformNav,
  supportModeBannerLabel,
  tenantAdminPayloadOmitsOrganizationId,
  tenantWorkspaceMustNotOverrideOrganizationId
} from "./platformAccess.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrc = path.resolve(__dirname, "..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(frontendSrc, relativePath), "utf8");
}

const tenantAdmin = {
  id: "u-admin",
  role: "administrator",
  saasRole: "ADMIN",
  isSuperAdmin: false
};

const superAdmin = {
  id: "u-super",
  role: "administrator",
  saasRole: "SUPER_ADMIN",
  isSuperAdmin: true
};

const recruiter = {
  id: "u-rep",
  role: "recruiter",
  saasRole: "REPRESENTATIVE"
};

describe("isSuperAdminUser", () => {
  it("does not treat tenant administrator as Super Admin", () => {
    assert.equal(isSuperAdminUser(tenantAdmin), false);
    assert.equal(isSuperAdminUser({ role: "administrator" }), false);
  });

  it("recognizes saasRole / isSuperAdmin flags", () => {
    assert.equal(isSuperAdminUser(superAdmin), true);
    assert.equal(isSuperAdminUser({ role: "SUPER_ADMIN" }), true);
    assert.equal(isSuperAdminUser({ saasRole: "super_admin" }), true);
  });
});

describe("platform nav and page access", () => {
  it("hides Platform nav from normal tenant users", () => {
    assert.equal(shouldShowPlatformNav(tenantAdmin), false);
    assert.equal(shouldShowPlatformNav(recruiter), false);
    assert.equal(canAccessPlatformTenantsPage(tenantAdmin), false);
  });

  it("allows Super Admin tenant page", () => {
    assert.equal(shouldShowPlatformNav(superAdmin), true);
    assert.equal(canAccessPlatformTenantsPage(superAdmin), true);
  });
});

describe("tenant lifecycle UI rules", () => {
  it("requires confirmation before SUSPENDED", () => {
    assert.equal(requiresSuspendConfirmation("SUSPENDED"), true);
    assert.equal(requiresSuspendConfirmation("ACTIVE"), false);
    assert.equal(requiresSuspendConfirmation("TRIAL"), false);
    assert.equal(requiresSuspendConfirmation("PAST_DUE"), false);
  });

  it("requires confirmation to reactivate from SUSPENDED", () => {
    assert.equal(requiresReactivateConfirmation("SUSPENDED", "ACTIVE"), true);
    assert.equal(requiresReactivateConfirmation("SUSPENDED", "TRIAL"), true);
    assert.equal(requiresReactivateConfirmation("ACTIVE", "TRIAL"), false);
  });

  it("blocks Support Mode enter for suspended tenants", () => {
    const suspended = { id: "org-1", lifecycleStatus: "SUSPENDED" };
    const trial = { id: "org-2", lifecycleStatus: "TRIAL" };
    assert.equal(isTenantSuspended(suspended), true);
    assert.equal(canEnterSupportMode(suspended), false);
    assert.equal(canEnterSupportMode(trial), true);
  });
});

describe("Support Mode banner", () => {
  it("shows labeled banner when support context is active", () => {
    const support = { active: true, organizationName: "Acme Recruiting", organizationId: "org-a" };
    assert.equal(isSupportModeBannerVisible(support), true);
    assert.equal(supportModeBannerLabel(support), "SUPPORT MODE — Acme Recruiting");
  });

  it("clears banner after exit", () => {
    assert.equal(isSupportModeBannerVisible({ active: false }), false);
    assert.equal(isSupportModeBannerVisible(null), false);
  });

  it("asks confirmation before switching tenants", () => {
    const support = { active: true, organizationId: "org-a", organizationName: "A" };
    assert.equal(shouldConfirmSupportModeSwitch(support, "org-b"), true);
    assert.equal(shouldConfirmSupportModeSwitch(support, "org-a"), false);
    assert.equal(shouldConfirmSupportModeSwitch({ active: false }, "org-b"), false);
  });
});

describe("platform API payloads", () => {
  it("creates tenant with default TRIAL and no billing fields", () => {
    const payload = buildCreateTenantPayload({ name: "North", slug: "north" });
    assert.equal(payload.status, DEFAULT_CREATE_TENANT_STATUS);
    assert.equal(payload.status, "TRIAL");
    assert.equal(payload.slug, "north");
    assert.equal("subscriptionPlan" in payload, false);
  });

  it("assigns admin using selected tenant id and omits organizationId", () => {
    const tenantId = "org-selected";
    const payload = buildAssignTenantAdminPayload({
      firstName: "Ada",
      lastName: "Admin",
      email: "ada@example.com"
    });
    assert.equal(assignTenantAdminPath(tenantId), "/api/platform/tenants/org-selected/admin");
    assert.equal(tenantAdminPayloadOmitsOrganizationId(payload), true);
  });

  it("patches status with lifecycleStatus", () => {
    assert.deepEqual(buildUpdateTenantStatusPayload("ACTIVE"), { lifecycleStatus: "ACTIVE" });
  });

  it("enters Support Mode with organizationId only on the support-mode API", () => {
    assert.deepEqual(buildEnterSupportModePayload("org-b"), { organizationId: "org-b" });
  });

  it("does not send arbitrary organizationId on tenant workspace requests", () => {
    assert.equal(
      tenantWorkspaceMustNotOverrideOrganizationId({
        url: "/api/conversations",
        query: {},
        body: {}
      }),
      true
    );
    assert.equal(
      tenantWorkspaceMustNotOverrideOrganizationId({
        url: "/api/conversations?organizationId=org-b",
        query: { organizationId: "org-b" }
      }),
      false
    );
  });
});

describe("app shell wiring", () => {
  const workspaceExperience = readSrc("config/workspaceExperience.js");
  const appSource = readSrc("App.jsx");
  const layoutSource = readSrc("layouts/MainLayout.jsx");
  const platformService = readSrc("services/platformService.js");
  const tenantsPage = readSrc("pages/platform/PlatformTenantsPage.jsx");
  const banner = readSrc("components/layout/SupportModeBanner.jsx");

  it("gates Platform nav with requiresSuperAdmin", () => {
    assert.match(workspaceExperience, /requiresSuperAdmin: true/);
    assert.match(workspaceExperience, /platformTenants/);
    assert.match(workspaceExperience, /navPlatformTenants/);
    assert.match(workspaceExperience, /"platform\/tenants"/);
  });

  it("registers /app/platform/tenants", () => {
    assert.match(appSource, /path="platform\/tenants"/);
    assert.match(appSource, /PlatformTenantsPage/);
    assert.match(appSource, /path="platform\/ai-quality"/);
    assert.match(appSource, /AiQualityPage/);
  });

  it("renders tenant list fields and create/status/admin/support actions", () => {
    assert.match(tenantsPage, /tenant\.name/);
    assert.match(tenantsPage, /tenant\.slug/);
    assert.match(tenantsPage, /lifecycleStatus/);
    assert.match(tenantsPage, /isActive/);
    assert.match(tenantsPage, /subscriptionStatus/);
    assert.match(tenantsPage, /createTenant/);
    assert.match(tenantsPage, /assignTenantAdmin\(selectedTenant\.id/);
    assert.match(tenantsPage, /canAssignFirstAdmin/);
    assert.match(tenantsPage, /OverflowMenu/);
    assert.match(tenantsPage, /ownerAdminLabel/);
    assert.match(tenantsPage, /requiresSuspendConfirmation/);
    assert.match(tenantsPage, /canEnterSupportMode/);
    assert.match(tenantsPage, /Support Mode unavailable while suspended/);
    assert.match(tenantsPage, /window\.confirm/);
  });

  it("keeps Support Mode banner in the app shell across navigation", () => {
    assert.match(layoutSource, /SupportModeBanner/);
    assert.match(layoutSource, /getSupportMode/);
    assert.match(layoutSource, /location\.pathname/);
    assert.match(layoutSource, /exitSupportMode/);
    assert.match(banner, /data-testid="support-mode-banner"/);
    assert.doesNotMatch(readSrc("pages/ConversationsPage.jsx"), /SupportModeBanner/);
    assert.doesNotMatch(readSrc("pages/ProspectCenter.jsx"), /SupportModeBanner/);
  });

  it("uses existing apiFetch platform endpoints", () => {
    assert.match(platformService, /from "\.\/apiClient"/);
    assert.match(platformService, /\/api\/platform\/tenants/);
    assert.match(platformService, /\/api\/platform\/tenants\/\$\{id\}\/status/);
    assert.match(platformService, /assignTenantAdminPath\(id\)/);
    assert.match(platformService, /\/api\/platform\/support-mode\/enter/);
    assert.match(platformService, /\/api\/platform\/support-mode\/exit/);
    assert.match(platformService, /export async function listTenants/);
    assert.match(platformService, /export async function getTenant/);
    assert.match(platformService, /export async function createTenant/);
    assert.match(platformService, /export async function updateTenantStatus/);
    assert.match(platformService, /export async function assignTenantAdmin/);
    assert.match(platformService, /export async function getSupportMode/);
    assert.match(platformService, /export async function enterSupportMode/);
    assert.match(platformService, /export async function exitSupportMode/);
  });
});
