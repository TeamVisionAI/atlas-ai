/**
 * Prospect fact persistence + workspace route normalization tests.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { shouldBlockLocationOverwrite } = require("../core/recruitAiV2/factCertainty");
const {
  extractExplicitEmailFromText,
  synchronizeExplicitEmailFromInbound
} = require("../core/recruitAiV2/prospectContactFactSync");
const {
  planQualificationFactSync,
  extractDurableInterviewType
} = require("../core/recruitAiV2/qualificationFactSync");
const { INTENTS } = require("../core/recruitAiV2/constants");

test("Fort Myers normalizes to Fort Myers, FL", () => {
  const parsed = parseLocationAnswer("Fort Myers");
  assert.equal(parsed?.city, "Fort Myers");
  assert.equal(parsed?.state, "FL");
  assert.equal(parsed?.completeness, "complete");
});

test('me parece cannot become Parece, ME', () => {
  assert.equal(parseLocationAnswer("Me parece"), null);
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Fort Myers",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "confirm_slot" }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "Me parece" },
    context: ctx,
    options: { flexible: true }
  });
  assert.notEqual(interpretation.intent, INTENTS.PROVIDE_LOCATION);
});

test("confirmed location cannot be overwritten by inferred junk", () => {
  const ctx = createConversationContext({
    knownFacts: {
      city: "Fort Myers",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    }
  });
  const blocked = shouldBlockLocationOverwrite(ctx.knownFacts, {
    intent: "provide_location",
    entities: { city: "Parece", state: "ME", completeness: "complete" }
  });
  assert.equal(blocked, true);
});

test("explicit email extracts and persists to prospect", async () => {
  const email = extractExplicitEmailFromText("Suhailader35@yahoo.com.mx");
  assert.equal(email, "suhailader35@yahoo.com.mx");

  const writes = [];
  const result = await synchronizeExplicitEmailFromInbound({
    messageText: "Suhailader35@yahoo.com.mx",
    prospect: { id: "p1", phone: "+12396288855", email: null, notes: null },
    organizationId: "org-1",
    updateProspectFn: async (phone, patch) => {
      writes.push({ phone, patch });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(writes[0].patch.email, "suhailader35@yahoo.com.mx");
});

test("Zoom decision maps to interview type for MC sync", () => {
  const interviewType = extractDurableInterviewType({
    knownFacts: {
      city: "Fort Myers",
      state: "FL",
      coverage: "OUTSIDE",
      preferredMeetingType: "zoom"
    }
  });
  assert.equal(interviewType, "Zoom");
});

test("confirmed durable location corrects legacy Parece, ME", () => {
  const plan = planQualificationFactSync({
    durableContext: {
      prospectId: "core-1",
      knownFacts: {
        city: "Fort Myers",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed"
      }
    },
    prospect: {
      id: "legacy-1",
      organization_id: "org-1",
      city: "Parece",
      state: "ME"
    },
    organizationId: "org-1",
    expectedCoreProspectId: "core-1",
    expectedLegacyProspectId: "legacy-1"
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.legacyUpdates.city, "Fort Myers");
  assert.equal(plan.legacyUpdates.state, "FL");
});

test("location overwrite blocked in context turn update path", () => {
  const loaded = createConversationContext({
    knownFacts: {
      city: "Fort Myers",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "Me parece" },
    context: loaded,
    options: { flexible: true }
  });
  const structuredDecision = decideConversationTurn({ context: loaded, interpretation });
  const next = buildNextContextFromInterpretation({
    loaded,
    interpretation,
    structuredDecision
  });
  assert.equal(next.knownFacts.city, "Fort Myers");
  assert.equal(next.knownFacts.state, "FL");
});
