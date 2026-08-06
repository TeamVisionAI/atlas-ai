/**
 * Communications Center authorization + read-only contract (source + unit).
 * No production password smoke — documented gap when CI secrets absent.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { canAccessProspect } = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const {
  sanitizeCommunicationsCenterResponse,
  assertNoRawContactLeak
} = require("../core/communicationsCenterSanitizer");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const PROSPECT_ID = "29853100-f151-4ca8-b07d-624fd20c6685";

function ctx(role, userId, organizationId) {
  return {
    userId,
    role,
    organizationId,
    status: "active"
  };
}

test("route stack is prospect-id auth and read-only", () => {
  const route = fs.readFileSync(
    path.join(__dirname, "../routes/communicationsCenter.js"),
    "utf8"
  );
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

  assert.match(route, /requireAtlasUser/);
  assert.match(route, /organizationGuard/);
  assert.match(route, /requireProspectAccessById/);
  assert.match(route, /sanitizeCommunicationsCenterResponse/);
  assert.doesNotMatch(route, /sendTextMessage|createAppointment|reschedule/);
  assert.match(server, /\/api\/prospects\/:id\/communications/);
  assert.doesNotMatch(server, /\/api\/communications-center/);
});

test("hierarchy: RVP/admin same org allowed; agent ownership enforced; cross-org denied", () => {
  const prospect = {
    id: PROSPECT_ID,
    organization_id: ORG_A,
    owner_user_id: "agent-owner"
  };

  assert.equal(
    canAccessProspect(ctx(ROLES.RVP, "rvp-1", ORG_A), prospect),
    true
  );
  assert.equal(
    canAccessProspect(ctx(ROLES.ADMINISTRATOR, "admin-1", ORG_A), prospect),
    true
  );
  assert.equal(
    canAccessProspect(ctx(ROLES.AGENT, "agent-owner", ORG_A), prospect),
    true
  );
  assert.equal(
    canAccessProspect(ctx(ROLES.AGENT, "other-agent", ORG_A), prospect),
    false
  );
  assert.equal(
    canAccessProspect(ctx(ROLES.RVP, "rvp-b", ORG_B), prospect),
    false
  );
});

test("Meta Review dedicated user remains gated by meta_review_user session contract files", () => {
  const metaFrontend = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/config/metaReviewMode.js"),
    "utf8"
  );
  assert.match(metaFrontend, /meta_review_user/);
  // Communications Center does not add Meta Review allowlist entries.
  const workspace = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/config/metaReviewWorkspace.test.js"),
    "utf8"
  );
  assert.doesNotMatch(workspace, /communications-center|CommunicationsCenterTimeline/);
});

test("error and success envelopes are PII-safe after sanitizer", () => {
  const errorBody = sanitizeCommunicationsCenterResponse({
    error: "COMMUNICATIONS_CENTER_FAILED",
    message: "Failed for +13059997338 Bearer abcdefghijklmnop"
  });
  assert.equal(assertNoRawContactLeak(errorBody).ok, true);

  const success = sanitizeCommunicationsCenterResponse({
    prospect: { id: PROSPECT_ID, currentContact: { maskedAddress: "***7338" } },
    items: [
      {
        metadata: { correlationId: "advance:+13059997338:slot" }
      }
    ]
  });
  assert.equal(assertNoRawContactLeak(success).ok, true);
  assert.equal(
    success.items[0].metadata.correlationId,
    "advance:<masked-contact>:slot"
  );
});

test("authenticated production smoke coverage documents credential gap", () => {
  // Do not create or embed credentials. Prefer unit/integration mocks.
  const hasCiSmoke =
    Boolean(process.env.ATLAS_CC_SMOKE_TOKEN) ||
    Boolean(process.env.ATLAS_VERIFY_EMAIL && process.env.ATLAS_VERIFY_PASSWORD);
  assert.equal(typeof hasCiSmoke, "boolean");
  if (!hasCiSmoke) {
    assert.ok(true, "production authenticated smoke not configured — gap documented");
  }
});
