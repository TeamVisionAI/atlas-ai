import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAuthenticatedShellBrand } from "./authenticatedShellBrand.js";

const tenantUser = { id: "u-tv", role: "recruiter", saasRole: "MEMBER" };
const superAdmin = { id: "u-sa", role: "administrator", saasRole: "SUPER_ADMIN", isSuperAdmin: true };

describe("resolveAuthenticatedShellBrand", () => {
  it("Team Vision user sees Team Vision from branding", () => {
    const brand = resolveAuthenticatedShellBrand({
      user: tenantUser,
      branding: { name: "Team Vision" }
    });
    assert.equal(brand.controlPlane, false);
    assert.equal(brand.name, "Team Vision");
  });

  it("Team Legacy user sees Team Legacy from branding", () => {
    const brand = resolveAuthenticatedShellBrand({
      user: { ...tenantUser, id: "u-tl" },
      branding: { name: "Team Legacy" }
    });
    assert.equal(brand.name, "Team Legacy");
  });

  it("Team Overcomers user sees Team Overcomers from branding", () => {
    const brand = resolveAuthenticatedShellBrand({
      user: { ...tenantUser, id: "u-to" },
      branding: { name: "Team Overcomers" }
    });
    assert.equal(brand.name, "Team Overcomers");
  });

  it("does not hardcode Team Vision when branding is another tenant", () => {
    const brand = resolveAuthenticatedShellBrand({
      user: tenantUser,
      branding: { name: "Team Legacy" }
    });
    assert.equal(brand.name, "Team Legacy");
    assert.notEqual(brand.name, "Team Vision");
  });

  it("Super Admin control-plane shows Atlas even if home-org branding is present", () => {
    const brand = resolveAuthenticatedShellBrand({
      user: superAdmin,
      supportMode: { active: false },
      branding: { name: "Team Vision" },
      atlasLabel: "Atlas"
    });
    assert.equal(brand.controlPlane, true);
    assert.equal(brand.name, "Atlas");
  });

  it("Super Admin Support Mode shows the selected tenant", () => {
    const brand = resolveAuthenticatedShellBrand({
      user: superAdmin,
      supportMode: {
        active: true,
        organizationId: "org-legacy",
        organizationName: "Team Legacy"
      },
      branding: { name: null, controlPlane: true },
      atlasLabel: "Atlas"
    });
    assert.equal(brand.controlPlane, false);
    assert.equal(brand.name, "Team Legacy");
  });

  it("Support Mode prefers loaded branding name over stale support label only when branding is tenant-scoped", () => {
    const brand = resolveAuthenticatedShellBrand({
      user: superAdmin,
      supportMode: {
        active: true,
        organizationId: "org-oc",
        organizationName: "Team Overcomers"
      },
      branding: { name: "Team Overcomers" }
    });
    assert.equal(brand.name, "Team Overcomers");
  });
});
