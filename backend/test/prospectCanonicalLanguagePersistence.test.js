/**
 * Canonical prospect language persistence — WhatsApp create + template routing.
 * Covers stale DB-default english vs Spanish communication fields (PR #134 template locale).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveProspectPreferredLanguage,
  resolveWhatsAppCreateLanguageFields,
  resolvePersistedLanguageUpdate,
  isStaleDefaultPreferredLanguage,
  hasAuthoritativePreferredLanguage,
  syncProspectLanguageFields
} = require("../core/prospectLanguage");
const { resolveTemplateLanguage } = require("../core/whatsappApprovedTemplateRegistry");
const {
  resolveCanonicalInterviewMetaTemplateName,
  resolveInterviewTemplateLocale
} = require("../../frontend/src/engines/nativeInterviewWhatsAppActions.js");
const { COMMUNICATION_ACTION_IDS } = require("../../frontend/src/engines/communicationActionStateEngine.js");

test("1. new Spanish inbound create fields → spanish preferred_language", () => {
  const fields = resolveWhatsAppCreateLanguageFields("¡Hola! Quiero más información");
  assert.equal(fields.preferred_language, "spanish");
  assert.equal(fields.communication_language, "es");
  assert.equal(fields.language, "es");
});

test("2. new English inbound create fields → english preferred_language", () => {
  const fields = resolveWhatsAppCreateLanguageFields("Hello, I want more information about the job");
  assert.equal(fields.preferred_language, "english");
  assert.equal(fields.communication_language, "en");
  assert.equal(fields.language, "en");
});

test("3. Spanish established + short Si → remains Spanish (no flip)", () => {
  const prospect = {
    preferred_language: "spanish",
    communication_language: "es",
    language: "es"
  };
  assert.equal(
    resolvePersistedLanguageUpdate(prospect, "en", { message: "Si" }),
    null
  );
  assert.equal(resolveProspectPreferredLanguage(prospect), "spanish");
});

test("4. English established + short Ok → remains English", () => {
  const prospect = {
    preferred_language: "english",
    communication_language: "en",
    language: "en"
  };
  assert.equal(
    resolvePersistedLanguageUpdate(prospect, "es", { message: "Ok" }),
    null
  );
  assert.equal(resolveProspectPreferredLanguage(prospect), "english");
});

test("5. explicit human/Quick Capture language not overwritten by detection", () => {
  const prospect = {
    preferred_language: "english",
    communication_language: "en",
    language: "en",
    notes: 'QUICK_CAPTURE:{"preferred_language":"english"}'
  };
  assert.equal(hasAuthoritativePreferredLanguage(prospect), true);
  assert.equal(
    resolvePersistedLanguageUpdate(prospect, "es", {
      message: "Hola quiero más información del trabajo"
    }),
    null
  );
  assert.equal(resolveProspectPreferredLanguage(prospect), "english");
});

test("6. stale DB-default english + Spanish pipeline + strong Spanish → persists spanish", () => {
  const prospect = {
    preferred_language: "english",
    communication_language: "es",
    language: "es"
  };
  assert.equal(isStaleDefaultPreferredLanguage(prospect), true);
  assert.equal(hasAuthoritativePreferredLanguage(prospect), false);
  assert.equal(resolveProspectPreferredLanguage(prospect), "spanish");

  const patch = resolvePersistedLanguageUpdate(prospect, "es", {
    message: "Soy ciudadana y quiero una entrevista"
  });
  assert.ok(patch);
  assert.equal(patch.preferred_language, "spanish");
  assert.equal(patch.communication_language, "es");
});

test("7. native interview WhatsApp routing uses spanish/english canonical language", () => {
  assert.equal(
    resolveInterviewTemplateLocale({ preferredLanguage: "spanish" }),
    "spanish"
  );
  assert.equal(
    resolveCanonicalInterviewMetaTemplateName(
      COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
      { preferredLanguage: "spanish" }
    ),
    "atlas_interview_details_es"
  );
  assert.equal(
    resolveCanonicalInterviewMetaTemplateName(
      COMMUNICATION_ACTION_IDS.SEND_REMINDER,
      { preferredLanguage: "english" }
    ),
    "atlas_interview_reminder_en"
  );
  assert.equal(
    resolveCanonicalInterviewMetaTemplateName(COMMUNICATION_ACTION_IDS.SEND_ZOOM, {
      preferredLanguage: "spanish"
    }),
    "atlas_zoom_invitation_es"
  );

  // Backend Meta template locale follows corrected prospect resolution.
  assert.equal(
    resolveTemplateLanguage({
      preferred_language: "english",
      communication_language: "es",
      language: "es"
    }),
    "spanish"
  );
  assert.equal(
    resolveTemplateLanguage({
      preferred_language: "english",
      communication_language: "en",
      language: "en"
    }),
    "english"
  );
});

test("create-time English is not operator-authoritative — strong Spanish may persist", () => {
  const prospect = {
    preferred_language: "english",
    communication_language: "en",
    language: "en"
  };
  assert.equal(hasAuthoritativePreferredLanguage(prospect), false);
  const patch = resolvePersistedLanguageUpdate(prospect, "es", {
    message: "Soy ciudadano y vivo en Fort Lauderdale"
  });
  assert.ok(patch);
  assert.equal(patch.preferred_language, "spanish");
});

test("8. tenant isolation unchanged — language helpers are prospect-row scoped", () => {
  const a = resolveProspectPreferredLanguage({
    organization_id: "org-a",
    preferred_language: "spanish",
    communication_language: "es",
    language: "es"
  });
  const b = resolveProspectPreferredLanguage({
    organization_id: "org-b",
    preferred_language: "english",
    communication_language: "en",
    language: "en"
  });
  assert.equal(a, "spanish");
  assert.equal(b, "english");
  assert.deepEqual(syncProspectLanguageFields("spanish").preferred_language, "spanish");
});

test("ambiguous WhatsApp first message still sets preferred_language (not DB english default)", () => {
  const fields = resolveWhatsAppCreateLanguageFields("8");
  assert.equal(fields.preferred_language, "spanish");
  assert.equal(fields.language, "es");
});

test("operator sync fields keep preferred + communication aligned", () => {
  assert.deepEqual(syncProspectLanguageFields("es"), {
    preferred_language: "spanish",
    communication_language: "es",
    language: "es"
  });
});
