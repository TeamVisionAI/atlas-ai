/**
 * Team Vision user invitations — FE access + rank contract.
 * Mirrors workspaceExperience gates without importing Vite-style modules.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUSINESS_RANK_ORDER,
  BUSINESS_RANK_LABELS,
  BUSINESS_RANK_DEFAULT_PERMISSION_ROLE
} from "./teamVisionBusinessRanks.js";
import { roleHasPermission, ROLES, PERMISSIONS } from "../security/workspacePermissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceExperienceSource = fs.readFileSync(
  path.join(__dirname, "workspaceExperience.js"),
  "utf8"
);
const adminUsersSource = fs.readFileSync(
  path.join(__dirname, "../pages/identity/AdminUsers.jsx"),
  "utf8"
);

test("FE business rank hierarchy matches Team Vision", () => {
  assert.deepEqual([...BUSINESS_RANK_ORDER], ["RVP", "SRL", "RL", "DIV", "DIS", "REP"]);
  assert.equal(BUSINESS_RANK_LABELS.DIS, "DIS — District Leader");
  assert.equal(BUSINESS_RANK_DEFAULT_PERMISSION_ROLE.REP, "recruiter");
  assert.notEqual(BUSINESS_RANK_DEFAULT_PERMISSION_ROLE.REP, "administrator");
});

test("RVP has admin:users; REP does not", () => {
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.ADMIN_USERS), true);
  assert.equal(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.ADMIN_USERS), true);
  assert.equal(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.ADMIN_USERS), false);
});

test("workspaceExperience opens Administration — Users for MANAGEMENT with admin:users", () => {
  assert.match(workspaceExperienceSource, /WORKSPACE_TYPES\.MANAGEMENT.*adminUsers|adminUsers[\s\S]*MANAGEMENT/);
  assert.match(
    workspaceExperienceSource,
    /USER_MANAGEMENT_ROUTE_RULE[\s\S]*WORKSPACE_TYPES\.MANAGEMENT/
  );
  assert.match(workspaceExperienceSource, /MANAGEMENT\]: \["settings", "adminUsers"\]/);
});

test("AdminUsers invite UI has Users/Invitations tabs and Invite User", () => {
  const helpersSource = fs.readFileSync(
    path.join(__dirname, "../pages/identity/adminUsersGridHelpers.js"),
    "utf8"
  );
  assert.match(adminUsersSource, /Invite User/);
  assert.match(adminUsersSource, /Invitations/);
  assert.match(adminUsersSource, /Business Rank/);
  assert.match(adminUsersSource, /Permission Role/);
  assert.match(adminUsersSource, /admin-users-toolbar/);
  assert.match(adminUsersSource, /OverflowMenu|•••|RowActionsMenu/);
  assert.match(helpersSource, /Resend Invite/);
  assert.match(helpersSource, /Revoke Invite/);
});
