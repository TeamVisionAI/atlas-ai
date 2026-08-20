/**
 * Tenant Settings → Billing access contract.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAccessBillingSettings,
  canEditTenantBillingPage
} from "../security/billingSettingsAccess.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const workspaceExperienceSource = fs.readFileSync(
  path.join(__dirname, "workspaceExperience.js"),
  "utf8"
);
const billingPageSource = fs.readFileSync(
  path.join(__dirname, "../pages/configuration/BillingConfiguration.jsx"),
  "utf8"
);
const appSource = fs.readFileSync(path.join(__dirname, "../App.jsx"), "utf8");

const adminUser = { role: "administrator", saasRole: "ADMIN" };
const rvpUser = { role: "rvp", saasRole: "RVP" };
const superAdminUser = { role: "administrator", saasRole: "SUPER_ADMIN", isSuperAdmin: true };

describe("Billing settings access", () => {
  it("administrator can access read-only billing settings", () => {
    assert.equal(canAccessBillingSettings(adminUser), true);
    assert.equal(canEditTenantBillingPage(adminUser), false);
  });

  it("RVP cannot access billing settings", () => {
    assert.equal(canAccessBillingSettings(rvpUser), false);
  });

  it("SUPER_ADMIN can access billing settings", () => {
    assert.equal(canAccessBillingSettings(superAdminUser), true);
  });

  it("registers settings/billing route and hub section", () => {
    assert.match(workspaceExperienceSource, /"settings\/billing":/);
    assert.match(workspaceExperienceSource, /id:\s*"billing"/);
    assert.match(appSource, /path="billing"\s+element=\{<BillingConfiguration/);
  });

  it("tenant billing page has no write controls", () => {
    assert.doesNotMatch(billingPageSource, /Mark Paid/);
    assert.doesNotMatch(billingPageSource, /Extend Trial/);
    assert.doesNotMatch(billingPageSource, /updateTenantBilling/);
  });
});
