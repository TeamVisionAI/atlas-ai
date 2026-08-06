/**
 * Recruit AI conversational schedule flexibility vs Meta Review boundary.
 *
 * Normal production: "6?" and "What about 6:30?" parse as time counteroffers.
 * Meta Review mode: parser stays historically strict; nav/allowlist unchanged.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  parseScheduleRequest,
  detectScheduleOverride,
  isConversationalScheduleFlexibilityEnabled
} = require("../core/scheduleLanguageParser");
const { META_REVIEW_MODE_ENV } = require("../config/metaReviewMode");

const ORIGINAL_META_REVIEW_MODE = process.env[META_REVIEW_MODE_ENV];

function setMetaReviewMode(enabled) {
  if (enabled) {
    process.env[META_REVIEW_MODE_ENV] = "true";
  } else {
    delete process.env[META_REVIEW_MODE_ENV];
  }
}

describe("schedule conversational flexibility × Meta Review boundary", () => {
  after(() => {
    if (ORIGINAL_META_REVIEW_MODE === undefined) {
      delete process.env[META_REVIEW_MODE_ENV];
    } else {
      process.env[META_REVIEW_MODE_ENV] = ORIGINAL_META_REVIEW_MODE;
    }
  });

  it("normal Recruit AI handles “6?” as a time counteroffer", () => {
    setMetaReviewMode(false);
    assert.equal(isConversationalScheduleFlexibilityEnabled(), true);

    const parsed = parseScheduleRequest("6?", { phase: "TIME" });
    assert.ok(parsed);
    assert.equal(parsed.hour, 6);
    assert.equal(parsed.normalizedHour, 18);
    assert.equal(parsed.flexibleApplied, true);

    const override = detectScheduleOverride("6?", { phase: "TIME" });
    assert.ok(override);
    assert.equal(override.normalizedHour, 18);
  });

  it("normal Recruit AI handles “What about 6:30?” as a time counteroffer", () => {
    setMetaReviewMode(false);

    const parsed = parseScheduleRequest("What about 6:30?", { phase: "TIME" });
    assert.ok(parsed);
    assert.equal(parsed.hour, 6);
    assert.equal(parsed.minute, 30);
    assert.equal(parsed.normalizedHour, 18);
  });

  it("Meta Review mode keeps “6?” unparsed (strict historical behavior)", () => {
    setMetaReviewMode(true);
    assert.equal(isConversationalScheduleFlexibilityEnabled(), false);

    const parsed = parseScheduleRequest("6?", { phase: "TIME" });
    assert.equal(parsed, null);
  });

  it("Meta Review mode does not unlock new flexibility flags on parse results", () => {
    setMetaReviewMode(true);
    const about = parseScheduleRequest("What about 6:30?", { phase: "TIME" });
    // Existing "about" pattern may still match without flexibility; must not claim flexibleApplied.
    if (about) {
      assert.equal(about.flexibleApplied, false);
    }
  });

  it("Meta Review navigation / allowlist contract files remain unchanged", () => {
    const metaReviewMode = path.join(
      __dirname,
      "../../frontend/src/config/metaReviewMode.js"
    );
    const workspace = path.join(
      __dirname,
      "../../frontend/src/config/workspaceExperience.js"
    );
    const requireAccess = path.join(
      __dirname,
      "../../frontend/src/components/RequireWorkspaceAccess.jsx"
    );
    const authRoute = path.join(__dirname, "../routes/auth.js");
    const middleware = path.join(__dirname, "../middleware/requireMetaReviewMode.js");

    for (const file of [metaReviewMode, workspace, requireAccess, authRoute, middleware]) {
      assert.equal(fs.existsSync(file), true, file);
    }

    const authSource = fs.readFileSync(authRoute, "utf8");
    assert.match(authSource, /sanitizedUser|meta_review_user|\/me/);

    const workspaceSource = fs.readFileSync(workspace, "utf8");
    assert.match(workspaceSource, /META_REVIEW_ALLOWED_ROUTE_KEYS|isMetaReviewWorkspaceActive/);
    assert.doesNotMatch(workspaceSource, /isConversationalScheduleFlexibilityEnabled/);
  });

  it("shared auth/session middleware was not modified for this sprint", () => {
    const authenticate = fs.readFileSync(
      path.join(__dirname, "../middleware/authenticate.js"),
      "utf8"
    );
    assert.doesNotMatch(authenticate, /scheduleLanguageParser|conversationalScheduleFlexibility/);

    const requireMeta = fs.readFileSync(
      path.join(__dirname, "../middleware/requireMetaReviewMode.js"),
      "utf8"
    );
    assert.doesNotMatch(requireMeta, /scheduleLanguageParser|6\?/);
  });
});
