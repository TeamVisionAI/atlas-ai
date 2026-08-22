/**
 * BR-149 — Frontend Team Dashboard route/landing gates.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES, PERMISSIONS, roleHasPermission } from "../security/workspacePermissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(path.join(__dirname, "workspaceExperience.js"), "utf8");
const permissionsSource = fs.readFileSync(
  path.join(__dirname, "../security/workspacePermissions.js"),
  "utf8"
);

test("BR-149 permission matrix mirrors backend intent", () => {
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.DASHBOARD_EXECUTIVE), true);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.DASHBOARD_EXECUTIVE), false);
  assert.equal(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.DASHBOARD_EXECUTIVE), false);
  assert.equal(roleHasPermission(ROLES.AGENT, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(roleHasPermission(ROLES.AGENT, PERMISSIONS.DASHBOARD_EXECUTIVE), false);
});

test("BR-149 FE matrix defines dashboard:team", () => {
  assert.match(permissionsSource, /DASHBOARD_TEAM:\s*"dashboard:team"/);
  assert.match(permissionsSource, /PERMISSIONS\.DASHBOARD_TEAM/);
});

test("BR-149 team-dashboard route gated by dashboard:team not executive", () => {
  const routeBlock = workspaceSource.match(
    /"team-dashboard":\s*\{[^}]*permission:\s*PERMISSIONS\.([A-Z_]+)/
  );
  assert.ok(routeBlock, "team-dashboard ROUTE_ACCESS present");
  assert.equal(routeBlock[1], "DASHBOARD_TEAM");

  const navBlock = workspaceSource.match(
    /teamDashboard:\s*\{[\s\S]*?permission:\s*PERMISSIONS\.([A-Z_]+)/
  );
  assert.ok(navBlock, "teamDashboard nav present");
  assert.equal(navBlock[1], "DASHBOARD_TEAM");
});

test("BR-149 executive-dashboard remains dashboard:executive", () => {
  assert.match(
    workspaceSource,
    /"executive-dashboard":\s*\{[\s\S]*?permission:\s*PERMISSIONS\.DASHBOARD_EXECUTIVE/
  );
});

test("BR-149 landing prefers executive then team", () => {
  assert.match(workspaceSource, /getDefaultLandingPath/);
  assert.match(workspaceSource, /DASHBOARD_EXECUTIVE/);
  assert.match(workspaceSource, /DASHBOARD_TEAM/);
  assert.match(workspaceSource, /executive-dashboard/);
  assert.match(workspaceSource, /team-dashboard/);
  assert.match(
    workspaceSource,
    /if \(roleHasPermission\(role, PERMISSIONS\.DASHBOARD_EXECUTIVE\)\)/
  );
  assert.match(workspaceSource, /if \(roleHasPermission\(role, PERMISSIONS\.DASHBOARD_TEAM\)\)/);
});

test("BR-149 representative landing includes teamDashboard", () => {
  assert.match(
    workspaceSource,
    /\[WORKSPACE_TYPES\.REPRESENTATIVE\]:\s*\["teamDashboard"/
  );
});
