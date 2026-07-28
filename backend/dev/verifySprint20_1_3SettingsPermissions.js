/**
 * Sprint 20.1.3 — Settings & integrations permission verification.
 */

const assert = require("assert");
const { ROLES } = require("../security/roles");
const { PERMISSIONS, roleHasPermission } = require("../security/permissions");

function run() {
  assert.strictEqual(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.ORG_READ), true);
  assert.strictEqual(roleHasPermission(ROLES.RVP, PERMISSIONS.ORG_READ), true);
  assert.strictEqual(roleHasPermission(ROLES.RVP, PERMISSIONS.ORG_WRITE), true);
  assert.strictEqual(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.ORG_READ), true);
  assert.strictEqual(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.ORG_WRITE), false);
  assert.strictEqual(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.ORG_READ), false);

  console.log("PASS: Sprint 20.1.3 backend settings permissions");
}

run();
