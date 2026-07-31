require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRequiredInputs,
  buildSuggestedQualificationDefaults,
  getQualificationFormGaps
} = require("../core/conversationOutcomeEngine");
const { buildProfileFromProspect } = require("../core/informationModel");
const {
  hasStoredPreferredLanguage,
  resolveProspectPreferredLanguage,
  syncProspectLanguageFields
} = require("../core/prospectLanguage");

function inputKeys(prospect) {
  const profile = buildProfileFromProspect(prospect);
  return buildRequiredInputs(prospect, profile).map((row) => row.key);
}

test("hasStoredPreferredLanguage detects Quick Capture Spanish prospect", () => {
  const prospect = {
    preferred_language: "spanish",
    communication_language: "es",
    language: "es",
    entry_method: "QUICK_CAPTURE"
  };

  assert.equal(hasStoredPreferredLanguage(prospect), true);
  assert.equal(resolveProspectPreferredLanguage(prospect), "spanish");
});

test("qualification form omits preferred_language when language was established in Quick Capture", () => {
  const prospect = {
    phone: "+10000000001",
    city: null,
    state: null,
    occupation: null,
    work_authorized: null,
    preferred_language: "spanish",
    communication_language: "es",
    language: "es",
    entry_method: "QUICK_CAPTURE",
    first_name: "Ana",
    last_name: "Test",
    notes: null
  };
  const profile = buildProfileFromProspect(prospect);
  const keys = inputKeys(prospect);
  const gaps = getQualificationFormGaps(prospect, profile);

  assert.ok(keys.includes("city"));
  assert.ok(keys.includes("occupation"));
  assert.ok(!keys.includes("preferred_language"), `Expected no language field, got ${JSON.stringify(keys)}`);
  assert.ok(!gaps.includes("preferred_language"));
});

test("qualification form includes preferred_language only when no language is stored", () => {
  const prospect = {
    phone: "+10000000005",
    city: null,
    state: null,
    occupation: null,
    work_authorized: null,
    preferred_language: null,
    communication_language: null,
    language: null,
    first_name: "Ana",
    last_name: "Test",
    notes: null
  };
  const profile = buildProfileFromProspect(prospect);
  const keys = inputKeys(prospect);

  assert.ok(keys.includes("preferred_language"));
});

test("suggested qualification defaults preserve stored Spanish language", () => {
  const prospect = {
    preferred_language: "spanish",
    communication_language: "es",
    language: "es"
  };
  const profile = buildProfileFromProspect(prospect);
  const defaults = buildSuggestedQualificationDefaults(prospect, profile, { language: "en" }, {});

  assert.equal(defaults.preferred_language, "spanish");
});

test("suggested qualification defaults use brain language only when prospect has no stored language", () => {
  const prospect = {
    preferred_language: null,
    communication_language: null,
    language: null
  };
  const profile = buildProfileFromProspect(prospect);
  const defaults = buildSuggestedQualificationDefaults(prospect, profile, { language: "es" }, {});

  assert.equal(defaults.preferred_language, "spanish");
});

test("syncProspectLanguageFields keeps Spanish codes aligned", () => {
  assert.deepEqual(syncProspectLanguageFields("spanish"), {
    preferred_language: "spanish",
    communication_language: "es",
    language: "es"
  });
});
