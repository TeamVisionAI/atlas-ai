/**
 * C2 — Recruiting settings access contract.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAccessRecruitingSettings,
  canEditRecruitingConfig
} from "../security/recruitingConfigAccess.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceExperienceSource = fs.readFileSync(
  path.join(__dirname, "workspaceExperience.js"),
  "utf8"
);
const recruitingPageSource = fs.readFileSync(
  path.join(__dirname, "../pages/configuration/RecruitingConfiguration.jsx"),
  "utf8"
);
const appSource = fs.readFileSync(path.join(__dirname, "../App.jsx"), "utf8");
const supportBannerSource = fs.readFileSync(
  path.join(__dirname, "../components/layout/SupportModeBanner.jsx"),
  "utf8"
);

const adminUser = { role: "administrator", saasRole: "ADMIN" };
const rvpUser = { role: "rvp", saasRole: "RVP" };
const superAdminUser = { role: "administrator", saasRole: "SUPER_ADMIN", isSuperAdmin: true };

describe("Recruiting settings access (C2)", () => {
  it("administrator can access recruiting settings", () => {
    assert.equal(canAccessRecruitingSettings(adminUser), true);
    assert.equal(canEditRecruitingConfig(adminUser), true);
  });

  it("RVP cannot edit recruiting settings", () => {
    assert.equal(canEditRecruitingConfig(rvpUser), false);
  });

  it("SUPER_ADMIN can access and edit recruiting settings", () => {
    assert.equal(canAccessRecruitingSettings(superAdminUser), true);
    assert.equal(canEditRecruitingConfig(superAdminUser), true);
  });

  it("registers settings/recruiting route and hub section", () => {
    assert.match(workspaceExperienceSource, /"settings\/recruiting":/);
    assert.match(workspaceExperienceSource, /id:\s*"recruiting"/);
    assert.match(appSource, /path="recruiting"\s+element=\{<RecruitingConfiguration/);
  });

  it("Support Mode tenant label is shown near page title without org dropdown", () => {
    assert.match(recruitingPageSource, /data-testid="recruiting-config-tenant"/);
    assert.match(recruitingPageSource, /recruitingConfigSupportModeTenant/);
    assert.doesNotMatch(recruitingPageSource, /organizationId/);
    assert.doesNotMatch(recruitingPageSource, /organization dropdown/i);
  });

  it("Support Mode banner component remains unchanged by recruiting page", () => {
    assert.match(supportBannerSource, /data-testid="support-mode-banner"/);
    assert.doesNotMatch(recruitingPageSource, /SupportModeBanner/);
  });

  it("no systemPrompt input exists on recruiting settings page", () => {
    assert.doesNotMatch(recruitingPageSource, /systemPrompt/);
    assert.doesNotMatch(recruitingPageSource, /system prompt/i);
  });
});
