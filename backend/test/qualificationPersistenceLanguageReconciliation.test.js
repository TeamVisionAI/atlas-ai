/**
 * Qualification persistence / language reconciliation (MC Complete Qualification).
 * Canonical city/state must persist from conversation facts without a manual re-save.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { extractInformation } = require("../core/informationExtractor");
const {
  defaultCaptureState,
  encodeQualificationCapture,
  markCapturedFields,
  parseQualificationCapture,
  isCityExplicitlyCaptured,
  isStateExplicitlyCaptured
} = require("../core/qualificationCaptureState");
const { buildProfileFromProspect } = require("../core/informationModel");
const {
  buildRequiredInputs,
  buildConversationOutcomeReadModel,
  getQualificationFormGaps
} = require("../core/conversationOutcomeEngine");
const {
  planQualificationFactSync,
  synchronizeQualificationFactsForMissionControl,
  SYNC_REASON
} = require("../core/recruitAiV2/qualificationFactSync");
const {
  resolvePersistedLanguageUpdate,
  hasAuthoritativePreferredLanguage,
  resolveProspectPreferredLanguage
} = require("../core/prospectLanguage");

function prospectWithCapture(overrides = {}) {
  const notes =
    overrides.notes !== undefined
      ? overrides.notes
      : encodeQualificationCapture(defaultCaptureState());
  return {
    id: "b2222222-2222-4222-8222-222222222222",
    phone: "+15555550776",
    organization_id: "00000000-0000-4000-8000-000000000001",
    name: "Atlas Qual",
    city: null,
    state: null,
    work_authorized: null,
    interview_type: null,
    preferred_language: "english",
    communication_language: "en",
    language: "en",
    notes,
    workflow_state: { canonicalMilestone: "QUALIFICATION" },
    ...overrides,
    notes: overrides.notes !== undefined ? overrides.notes : notes
  };
}

test("A. Vivo en Fort Lauderdale, Florida persists city/state — no identical re-save", () => {
  const extracted = extractInformation("Vivo en Fort Lauderdale, Florida.");
  assert.equal(String(extracted.city).toLowerCase(), "fort lauderdale");
  assert.equal(String(extracted.state).toUpperCase(), "FL");

  const capture = markCapturedFields(defaultCaptureState(), extracted);
  const prospect = prospectWithCapture({
    city: extracted.city,
    state: extracted.state,
    notes: encodeQualificationCapture(capture)
  });
  const profile = buildProfileFromProspect(prospect);
  const keys = buildRequiredInputs(prospect, profile).map((row) => row.key);
  const outcome = buildConversationOutcomeReadModel({
    prospect,
    brain: { language: "es", missingFields: [] },
    workflow: prospect.workflow_state
  });

  assert.ok(!keys.includes("city"), `city still required: ${JSON.stringify(keys)}`);
  assert.ok(!keys.includes("state"), `state still required: ${JSON.stringify(keys)}`);
  assert.equal(outcome.fields.city.toLowerCase(), "fort lauderdale");
  assert.equal(String(outcome.fields.state).toUpperCase(), "FL");
  assert.ok(isCityExplicitlyCaptured(profile, capture, prospect.notes));
  assert.ok(isStateExplicitlyCaptured(profile, capture, prospect.notes));
});

test("A2. QUAL_CAPTURE city:false with canonical Fort Lauderdale still completes city/state", () => {
  const prospect = prospectWithCapture({
    city: "Fort Lauderdale",
    state: "FL",
    notes: encodeQualificationCapture({
      ...defaultCaptureState(),
      city: false,
      state: false
    })
  });
  const profile = buildProfileFromProspect(prospect);
  const gaps = getQualificationFormGaps(prospect, profile);
  assert.ok(!gaps.includes("city"), `city gap: ${JSON.stringify(gaps)}`);
  assert.ok(!gaps.includes("state"), `state gap: ${JSON.stringify(gaps)}`);
});

test("B. city + work authorization in one message both persist", () => {
  const extracted = extractInformation(
    "I live in Fort Lauderdale, Florida and I am a US citizen."
  );
  assert.equal(String(extracted.city).toLowerCase(), "fort lauderdale");
  assert.equal(String(extracted.state).toUpperCase(), "FL");
  assert.equal(extracted.authorization, true);

  const capture = markCapturedFields(defaultCaptureState(), extracted);
  assert.equal(capture.city, true);
  assert.equal(capture.state, true);
  assert.equal(capture.authorization, true);
});

test("C. established Spanish + Yes remains Spanish", () => {
  const prospect = {
    preferred_language: "spanish",
    communication_language: "es",
    language: "es"
  };
  assert.equal(
    resolvePersistedLanguageUpdate(prospect, "en", { message: "Yes" }),
    null
  );
  assert.equal(resolveProspectPreferredLanguage(prospect), "spanish");
});

test("D. established English stays English on weak tokens", () => {
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

test("E. explicit language change request updates preferred_language", () => {
  const prospect = {
    preferred_language: "english",
    communication_language: "en",
    language: "en"
  };
  const patch = resolvePersistedLanguageUpdate(prospect, "es", {
    message: "Prefiero español por favor"
  });
  assert.ok(patch);
  assert.equal(patch.preferred_language, "spanish");
  assert.equal(patch.communication_language, "es");
});

test("E2. explicit operator/QC language change is sticky", () => {
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
});

test("F. human-confirmed city is not overwritten by Atlas extraction", () => {
  const extracted = extractInformation("Vivo en Miami, Florida.", {
    city: "Fort Lauderdale",
    state: "FL"
  });
  assert.ok(!extracted.city, "must not overwrite human city");
  assert.ok(!extracted.state, "must not overwrite human state");

  const plan = planQualificationFactSync({
    durableContext: {
      prospectId: "a1111111-1111-4111-8111-111111111111",
      knownFacts: {
        city: "Miami",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed"
      }
    },
    prospect: prospectWithCapture({
      city: "Fort Lauderdale",
      state: "FL"
    }),
    organizationId: "00000000-0000-4000-8000-000000000001",
    expectedCoreProspectId: "a1111111-1111-4111-8111-111111111111",
    expectedLegacyProspectId: "b2222222-2222-4222-8222-222222222222"
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.reasonCode, SYNC_REASON.FACT_CONFLICT);
});

test("G. missing/ambiguous location still requires operator review", () => {
  const extracted = extractInformation("cerca de la playa");
  assert.ok(!extracted.city);
  const prospect = prospectWithCapture();
  const profile = buildProfileFromProspect(prospect);
  const keys = buildRequiredInputs(prospect, profile).map((row) => row.key);
  assert.ok(keys.includes("city"));
});

test("lone Florida message is state, not city", () => {
  const extracted = extractInformation("Florida");
  assert.ok(!extracted.city);
  assert.equal(extracted.state, "FL");
});

test("BR-134 hydrates columns even when QUAL_CAPTURE lagged", async () => {
  const writes = [];
  const prospect = prospectWithCapture({
    city: null,
    state: null,
    work_authorized: null,
    notes: encodeQualificationCapture(defaultCaptureState())
  });
  const sync = await synchronizeQualificationFactsForMissionControl({
    durableContext: {
      prospectId: "a1111111-1111-4111-8111-111111111111",
      knownFacts: {
        city: "Fort Lauderdale",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true
      }
    },
    prospect,
    organizationId: "00000000-0000-4000-8000-000000000001",
    expectedCoreProspectId: "a1111111-1111-4111-8111-111111111111",
    expectedLegacyProspectId: prospect.id,
    updateProspectFn: async (_phone, patch) => {
      writes.push(patch);
      Object.assign(prospect, patch);
    }
  });
  assert.equal(sync.ok, true);
  assert.equal(prospect.city, "Fort Lauderdale");
  assert.equal(prospect.state, "FL");
  const capture = parseQualificationCapture(prospect.notes);
  assert.equal(capture.city, true);
  assert.equal(capture.state, true);
  assert.equal(capture.authorization, true);
  const profile = buildProfileFromProspect(prospect);
  const gaps = getQualificationFormGaps(prospect, profile);
  assert.ok(!gaps.includes("city"));
  assert.ok(!gaps.includes("state"));
  assert.ok(!gaps.includes("authorization"));
});

test("qualification complete persists INTERVIEW_READY only via injected saveFn", async () => {
  const {
    persistInterviewReadyIfQualificationComplete
  } = require("../core/recruitAiV2/qualificationFactSync");
  const saves = [];
  const complete = prospectWithCapture({
    city: "Fort Lauderdale",
    state: "FL",
    work_authorized: true,
    interview_type: "in_person",
    preferred_language: "spanish",
    communication_language: "es",
    language: "es",
    notes: encodeQualificationCapture({
      ...defaultCaptureState(),
      city: true,
      state: true,
      authorization: true,
      interviewType: true
    })
  });
  const advanced = await persistInterviewReadyIfQualificationComplete(complete, {
    saveWorkflowFn: async (phone, patch) => {
      saves.push({ phone, patch });
    }
  });
  assert.equal(advanced.advanced, true);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].patch.canonicalMilestone, "INTERVIEW_READY");

  const incomplete = prospectWithCapture({ city: null, state: null });
  const skipped = await persistInterviewReadyIfQualificationComplete(incomplete, {
    saveWorkflowFn: async () => {
      throw new Error("must not save when gaps remain");
    }
  });
  assert.equal(skipped.advanced, false);
  assert.ok(skipped.gaps.includes("city"));
});
