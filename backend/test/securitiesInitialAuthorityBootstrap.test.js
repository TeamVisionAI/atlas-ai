/**
 * BR-074 — Initial securities authority bootstrap tests.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  validateBootstrapInput,
  bootstrapInitialSecuritiesAuthority,
  BOOTSTRAP_EVIDENCE_SOURCE,
  VERIFICATION_SOURCE,
  SECURITIES_VERIFY_PERMISSION
} = require("../security/securitiesInitialAuthorityBootstrapService");
const {
  upsertSecuritiesAuthorization,
  canAccessSecuritiesContent,
  canVerifySecuritiesAuthorization,
  hasCompleteVerificationMetadata
} = require("../security/securitiesAccessService");
const {
  parseArgs,
  assertExecuteGate,
  loadConfig
} = require("../scripts/bootstrapInitialSecuritiesAuthority");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const NIOVEL = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";

function validInput(overrides = {}) {
  return {
    organizationId: ORG_A,
    targetUserId: NIOVEL,
    technicalActor: "ops@teamvisionfinancial.com",
    verificationSource: VERIFICATION_SOURCE.INITIAL_FIRM_AUTHORITY_BOOTSTRAP,
    evidenceSource: BOOTSTRAP_EVIDENCE_SOURCE.WRITTEN_COMPLIANCE_CONFIRMATION,
    evidenceReference: "firm-authority-review-2026-08",
    evidenceVerifiedAt: "2026-08-04T00:00:00.000Z",
    effectiveFrom: "2026-08-04T00:00:00.000Z",
    effectiveTo: null,
    permittedProductScope: ["MUTUAL_FUNDS"],
    jurisdictionScope: ["FL"],
    reason: "Initial Team Vision securities authority bootstrap",
    dryRun: false,
    ...overrides
  };
}

function createMemoryDeps(seed = {}) {
  const state = {
    lock: seed.lock || null,
    auth: seed.auth || null,
    grants: seed.grants || [],
    history: [],
    audits: [],
    rolePermissionsWrites: [],
    ...seed
  };

  return {
    state,
    findOrganization: async (id) =>
      id === ORG_A ? { id: ORG_A, name: "Team Vision" } : null,
    findUser: async (id) => {
      if (id === NIOVEL) {
        return { id: NIOVEL, organization_id: ORG_A, email: "niovel@example.com", role: "administrator" };
      }
      if (id === OTHER) {
        return { id: OTHER, organization_id: ORG_A, email: "rep@example.com", role: "recruiter" };
      }
      if (id === "cross-org-user") {
        return { id: "cross-org-user", organization_id: ORG_B, email: "x@example.com", role: "administrator" };
      }
      return null;
    },
    findBootstrapLock: async () => state.lock,
    listOrgUserIds: async () => [NIOVEL, OTHER],
    listActiveVerifyGrants: async () => state.grants,
    findAuthorization: async () => state.auth,
    grantVerifyPermission: async ({ userId, reason }) => {
      const row = {
        user_id: userId,
        permission_code: SECURITIES_VERIFY_PERMISSION,
        granted: true,
        reason
      };
      state.grants.push(row);
      return row;
    },
    upsertAuthorization: async (row) => {
      state.auth = { id: "auth-1", ...row };
      return state.auth;
    },
    appendHistory: async (entry) => {
      state.history.push(entry);
      return entry;
    },
    insertBootstrapLock: async (row) => {
      state.lock = row;
      return row;
    },
    writeAuditLog: async (entry) => {
      state.audits.push(entry);
      return entry;
    },
    now: () => new Date("2026-08-04T12:00:00.000Z")
  };
}

test("missing evidence metadata is rejected", () => {
  assert.throws(
    () => validateBootstrapInput(validInput({ evidenceSource: null })),
    (error) => error.publicCode === "BOOTSTRAP_EVIDENCE_INCOMPLETE"
  );
  assert.throws(
    () => validateBootstrapInput(validInput({ evidenceReference: "" })),
    (error) => error.publicCode === "BOOTSTRAP_EVIDENCE_INCOMPLETE"
  );
  assert.throws(
    () => validateBootstrapInput(validInput({ evidenceVerifiedAt: null })),
    (error) => error.publicCode === "BOOTSTRAP_EVIDENCE_INCOMPLETE"
  );
});

test("cross-organization inputs are rejected", async () => {
  const deps = createMemoryDeps();
  await assert.rejects(
    () =>
      bootstrapInitialSecuritiesAuthority(
        validInput({ targetUserId: "cross-org-user" }),
        deps
      ),
    (error) => error.publicCode === "BOOTSTRAP_CROSS_ORG_FORBIDDEN"
  );
});

test("dry-run performs no writes", async () => {
  const deps = createMemoryDeps();
  const result = await bootstrapInitialSecuritiesAuthority(validInput({ dryRun: true }), deps);

  assert.equal(result.dryRun, true);
  assert.equal(result.written, false);
  assert.equal(deps.state.grants.length, 0);
  assert.equal(deps.state.auth, null);
  assert.equal(deps.state.history.length, 0);
  assert.equal(deps.state.audits.length, 0);
  assert.equal(deps.state.lock, null);
});

test("bootstrap succeeds only when organization has no existing verifier", async () => {
  const deps = createMemoryDeps();
  const result = await bootstrapInitialSecuritiesAuthority(validInput(), deps);

  assert.equal(result.written, true);
  assert.equal(result.securities_verify_granted, true);
  assert.equal(result.securities_access_status, "VERIFIED_ACTIVE");
  assert.equal(deps.state.grants.length, 1);
  assert.equal(deps.state.grants[0].permission_code, "securities:verify");
  assert.equal(deps.state.auth.securities_access_status, "VERIFIED_ACTIVE");
  assert.equal(
    deps.state.auth.verification_source,
    VERIFICATION_SOURCE.INITIAL_FIRM_AUTHORITY_BOOTSTRAP
  );
  assert.equal(deps.state.history.length, 1);
  assert.ok(deps.state.audits.some((a) => a.action === "securities.authorization.bootstrap"));
  assert.ok(deps.state.audits.some((a) => a.action === "securities.verify_permission.granted"));
  assert.ok(deps.state.lock);
  assert.equal(deps.state.rolePermissionsWrites.length, 0);
});

test("bootstrap refuses when an active verifier already exists", async () => {
  const deps = createMemoryDeps({
    grants: [{ user_id: OTHER, permission_code: "securities:verify", granted: true }]
  });

  await assert.rejects(
    () => bootstrapInitialSecuritiesAuthority(validInput(), deps),
    (error) => error.publicCode === "BOOTSTRAP_VERIFIER_EXISTS"
  );
});

test("bootstrap refuses when already completed", async () => {
  const deps = createMemoryDeps({
    lock: {
      organization_id: ORG_A,
      target_user_id: NIOVEL,
      completed_at: "2026-08-01T00:00:00.000Z"
    }
  });

  await assert.rejects(
    () => bootstrapInitialSecuritiesAuthority(validInput(), deps),
    (error) => error.publicCode === "BOOTSTRAP_ALREADY_COMPLETED"
  );
});

test("re-running bootstrap is safely rejected after success", async () => {
  const deps = createMemoryDeps();
  await bootstrapInitialSecuritiesAuthority(validInput(), deps);
  await assert.rejects(
    () => bootstrapInitialSecuritiesAuthority(validInput(), deps),
    (error) => error.publicCode === "BOOTSTRAP_ALREADY_COMPLETED"
  );
});

test("bootstrap refuses when target already has authorization", async () => {
  const deps = createMemoryDeps({
    auth: {
      id: "existing",
      securities_access_status: "PENDING_VERIFICATION",
      deleted_at: null
    }
  });

  await assert.rejects(
    () => bootstrapInitialSecuritiesAuthority(validInput(), deps),
    (error) => error.publicCode === "BOOTSTRAP_AUTHORIZATION_EXISTS"
  );
});

test("bootstrap does not create role permissions or SUPER_ADMIN bypass", async () => {
  const deps = createMemoryDeps();
  const result = await bootstrapInitialSecuritiesAuthority(validInput(), deps);
  assert.ok(result.notes.some((n) => /role_permissions/i.test(n)));
  assert.ok(result.notes.some((n) => /SUPER_ADMIN/i.test(n)));
  assert.equal(deps.state.rolePermissionsWrites.length, 0);
});

test("bootstrap authorization satisfies content access completeness", async () => {
  const deps = createMemoryDeps();
  await bootstrapInitialSecuritiesAuthority(validInput(), deps);

  assert.equal(hasCompleteVerificationMetadata(deps.state.auth), true);

  const canAccess = await canAccessSecuritiesContent(
    { userId: NIOVEL, organizationId: ORG_A },
    {
      now: new Date("2026-08-05T00:00:00.000Z"),
      findAuthorization: async () => deps.state.auth
    }
  );
  assert.equal(canAccess, true);
});

test("after bootstrap, target cannot self-edit through normal routes", async () => {
  await assert.rejects(
    () =>
      upsertSecuritiesAuthorization(
        NIOVEL,
        { securities_access_status: "VERIFIED_ACTIVE" },
        { userId: NIOVEL, organizationId: ORG_A }
      ),
    (error) => error.publicCode === "SELF_VERIFICATION_FORBIDDEN"
  );
});

test("after bootstrap grant, target can verify another user (capability path)", async () => {
  const canVerify = await canVerifySecuritiesAuthorization(
    { userId: NIOVEL, organizationId: ORG_A },
    {
      hasExplicitPermission: async ({ userId, permissionCode }) =>
        userId === NIOVEL && permissionCode === "securities:verify"
    }
  );
  assert.equal(canVerify, true);
});

test("bootstrap is not exposed as a normal HTTP securities route", () => {
  const routesPath = path.join(__dirname, "../routes/securitiesAccess.js");
  const serverPath = path.join(__dirname, "../server.js");
  const routes = fs.readFileSync(routesPath, "utf8");
  const server = fs.readFileSync(serverPath, "utf8");

  assert.doesNotMatch(routes, /bootstrapInitialSecuritiesAuthority/);
  assert.doesNotMatch(server, /bootstrapInitialSecuritiesAuthority/);
  assert.doesNotMatch(routes, /INITIAL_FIRM_AUTHORITY_BOOTSTRAP/);
});

test("CLI dry-run gate and execute confirmation", () => {
  const args = parseArgs(["--config", "/tmp/x.json"]);
  assert.equal(args.execute, false);
  assert.equal(assertExecuteGate({}, false), false);

  assert.throws(
    () => assertExecuteGate({}, true),
    (error) => error.code === "BOOTSTRAP_CONFIRMATION_REQUIRED"
  );

  assert.equal(
    assertExecuteGate({ CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP: "yes" }, true),
    true
  );
});

test("example config file exists and loads required fields", () => {
  const examplePath = path.join(
    __dirname,
    "../scripts/securities-authority-bootstrap.example.json"
  );
  const config = loadConfig(examplePath);
  assert.ok(config.organizationId);
  assert.ok(config.targetUserId);
  assert.match(String(config.organizationId), /^REPLACE_/);
  assert.match(String(config.targetUserId), /^REPLACE_/);
  assert.ok(config.evidenceSource);
  assert.ok(config.evidenceReference);
  assert.ok(config.permittedProductScope);
  assert.ok(config.reason);
  assert.doesNotMatch(JSON.stringify(config), /[0-9a-f]{8}-[0-9a-f]{4}-/i);
});

test("migration 027 creates lock table and does not seed users", () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../database/migrations/027_securities_authority_bootstrap_lock.sql"
    ),
    "utf8"
  );
  assert.match(sql, /atlas_organization_securities_authority_bootstrap/);
  assert.doesNotMatch(sql, /INSERT INTO atlas_users/i);
  assert.doesNotMatch(sql, /INSERT INTO user_permissions/i);
  assert.doesNotMatch(sql, /Niovel/i);
});
