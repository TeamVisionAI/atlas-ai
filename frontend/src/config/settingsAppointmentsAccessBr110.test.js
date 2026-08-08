/**
 * BR-110 — MANAGEMENT may open Settings → Appointments (self only).
 *
 * workspaceExperience.js uses Vite-style extensionless imports, so this suite
 * mirrors the access contract (same approach as metaReviewWorkspace.test.js)
 * and asserts the source file contains the MANAGEMENT appointments gates.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceExperienceSource = fs.readFileSync(
  path.join(__dirname, "workspaceExperience.js"),
  "utf8"
);

const WORKSPACE_TYPES = Object.freeze({
  ADMINISTRATOR: "administrator",
  MANAGEMENT: "management",
  REPRESENTATIVE: "representative"
});

const ROLES = Object.freeze({
  ADMINISTRATOR: "administrator",
  RVP: "rvp",
  DIVISION_LEADER: "division_leader",
  AGENT: "agent",
  RECRUITER: "recruiter"
});

const ROLE_ALIASES = Object.freeze({
  field_trainer: ROLES.AGENT,
  regional_leader: ROLES.DIVISION_LEADER,
  representative: ROLES.RECRUITER
});

const SAAS_ROLE_ALIASES = Object.freeze({
  REGIONAL_LEADER: ROLES.DIVISION_LEADER,
  FIELD_TRAINER: ROLES.AGENT,
  REPRESENTATIVE: ROLES.RECRUITER
});

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (Object.values(ROLES).includes(role)) return role;
  if (ROLE_ALIASES[role]) return ROLE_ALIASES[role];
  const saas = String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
  if (SAAS_ROLE_ALIASES[saas]) return SAAS_ROLE_ALIASES[saas];
  return ROLES.RECRUITER;
}

function resolveWorkspaceType(role) {
  const normalized = normalizeRole(role);
  if (normalized === ROLES.ADMINISTRATOR) return WORKSPACE_TYPES.ADMINISTRATOR;
  if (normalized === ROLES.RVP || normalized === ROLES.DIVISION_LEADER) {
    return WORKSPACE_TYPES.MANAGEMENT;
  }
  return WORKSPACE_TYPES.REPRESENTATIVE;
}

/** Mirrored SETTINGS_HUB / ROUTE_ACCESS rule for appointments (BR-110). */
const APPOINTMENTS_ALLOWED = new Set([
  WORKSPACE_TYPES.ADMINISTRATOR,
  WORKSPACE_TYPES.MANAGEMENT
]);
const SCHEDULING_ALLOWED = new Set([WORKSPACE_TYPES.ADMINISTRATOR]);
const REVIEW_USERS_ALLOWED = new Set([WORKSPACE_TYPES.ADMINISTRATOR]);

function canAccessAppointments(role) {
  return APPOINTMENTS_ALLOWED.has(resolveWorkspaceType(role));
}

function canAccessScheduling(role) {
  return SCHEDULING_ALLOWED.has(resolveWorkspaceType(role));
}

function canAccessReviewUsers(role) {
  return REVIEW_USERS_ALLOWED.has(resolveWorkspaceType(role));
}

describe("BR-110 Settings → Appointments access contract", () => {
  it("source grants MANAGEMENT workspaceTypes on appointments route + hub", () => {
    assert.match(
      workspaceExperienceSource,
      /"settings\/appointments":\s*\{[\s\S]*?WORKSPACE_TYPES\.MANAGEMENT/
    );
    assert.match(
      workspaceExperienceSource,
      /id:\s*"appointments"[\s\S]*?WORKSPACE_TYPES\.MANAGEMENT/
    );
    // Org Scheduling must remain administrator-only.
    assert.match(
      workspaceExperienceSource,
      /"settings\/scheduling":\s*\{[\s\S]*?workspaceTypes:\s*\[WORKSPACE_TYPES\.ADMINISTRATOR\]/
    );
  });

  it("RVP / DL / RL see Appointments; not Scheduling / Review Users", () => {
    for (const role of [ROLES.RVP, ROLES.DIVISION_LEADER, "REGIONAL_LEADER"]) {
      assert.equal(resolveWorkspaceType(role), WORKSPACE_TYPES.MANAGEMENT);
      assert.equal(canAccessAppointments(role), true);
      assert.equal(canAccessScheduling(role), false);
      assert.equal(canAccessReviewUsers(role), false);
    }
  });

  it("FIELD_TRAINER / REPRESENTATIVE remain excluded", () => {
    for (const role of [ROLES.AGENT, ROLES.RECRUITER, "FIELD_TRAINER", "REPRESENTATIVE"]) {
      assert.equal(resolveWorkspaceType(role), WORKSPACE_TYPES.REPRESENTATIVE);
      assert.equal(canAccessAppointments(role), false);
    }
  });

  it("Administrator keeps Appointments + Scheduling; Review Users stays admin-only", () => {
    assert.equal(canAccessAppointments(ROLES.ADMINISTRATOR), true);
    assert.equal(canAccessScheduling(ROLES.ADMINISTRATOR), true);
    assert.equal(canAccessReviewUsers(ROLES.ADMINISTRATOR), true);
  });
});
