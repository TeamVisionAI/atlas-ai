/**
 * BR-134 — Mid-flow V2 qualification → Mission Control prospect SoR sync.
 * Mayra Santana-shaped: Davenport FL + authorized must fill null legacy columns
 * without waiting for INTERVIEW_SCHEDULED.
 */

"use strict";

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  synchronizeQualificationFactsForMissionControl,
  extractConfirmedDurableQualificationFacts,
  SYNC_REASON
} = require("../core/recruitAiV2/qualificationFactSync");
const {
  buildProfileFromProspect,
  getMissingFields
} = require("../core/informationModel");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const {
  parseWorkAuthorizationAnswer
} = require("../core/recruitAiV2/qualificationFacts");

const ORG = "00000000-0000-4000-8000-000000000001";
const CORE = "a1111111-1111-4111-8111-111111111111";
const LEGACY = "b2222222-2222-4222-8222-222222222222";
const PHONE = "+13473369274";

function mayraDurable(overrides = {}) {
  return {
    prospectId: CORE,
    organizationId: ORG,
    knownFacts: {
      city: "Davenport",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      ...(overrides.knownFacts || {})
    },
    ...overrides
  };
}

function sparseMayra(overrides = {}) {
  return {
    id: LEGACY,
    phone: PHONE,
    name: "Mayra Santana R",
    organization_id: ORG,
    city: null,
    state: null,
    work_authorized: null,
    current_step: "QUALIFICATION",
    ...overrides
  };
}

describe("BR-134 mid-flow qualification sync for Mission Control", () => {
  test("docs: BR-134 present and BR-127 retained", () => {
    const rules = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(rules, /## BR-134 — Mid-Flow Qualification Fact Sync for Mission Control/);
    assert.match(rules, /## BR-127 — Canonical Qualification Fact Synchronization/);
  });

  test("Mayra phrase Davenport florida parses complete city+state", () => {
    const parsed = parseLocationAnswer("Davenport florida", {
      preferredLanguage: "spanish"
    });
    assert.equal(parsed.completeness, "complete");
    assert.equal(String(parsed.city || "").toLowerCase(), "davenport");
    assert.equal(normalizeStateLike(parsed.state), "FL");
  });

  test("US citizen / authorized parses workAuthorization true", () => {
    const ctx = {
      conversation: { lastQuestionAsked: "ask_authorization" },
      preferredLanguage: "spanish",
      knownFacts: {}
    };
    const citizen = parseWorkAuthorizationAnswer("soy ciudadana americana", ctx);
    assert.ok(citizen);
    assert.equal(
      String(citizen).toLowerCase() === "authorized" || citizen === true,
      true
    );

    const yes = parseWorkAuthorizationAnswer("si tengo permiso", ctx);
    assert.ok(yes);
    assert.equal(
      String(yes).toLowerCase() === "authorized" || yes === true,
      true
    );
  });

  test("Mayra durable confirmed facts hydrate null legacy columns", async () => {
    const writes = [];
    const prospect = sparseMayra();
    const sync = await synchronizeQualificationFactsForMissionControl({
      durableContext: mayraDurable(),
      prospect,
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY,
      updateProspectFn: async (phone, patch) => {
        writes.push({ phone, patch });
        Object.assign(prospect, patch);
      }
    });

    assert.equal(sync.ok, true);
    assert.equal(sync.soft, true);
    assert.deepEqual(writes[0]?.patch, {
      city: "Davenport",
      state: "FL",
      work_authorized: true
    });
    assert.equal(prospect.city, "Davenport");
    assert.equal(prospect.state, "FL");
    assert.equal(prospect.work_authorized, true);

    const profile = buildProfileFromProspect(prospect);
    const missing = getMissingFields(profile);
    assert.ok(!missing.includes("city"), `city still missing: ${missing}`);
    assert.ok(!missing.includes("state"), `state still missing: ${missing}`);
    assert.ok(
      !missing.includes("authorization"),
      `authorization still missing: ${missing}`
    );
  });

  test("proposed location does not hydrate legacy city/state", async () => {
    const writes = [];
    const sync = await synchronizeQualificationFactsForMissionControl({
      durableContext: mayraDurable({
        knownFacts: {
          city: "Davenport",
          state: "FL",
          cityCertainty: "proposed",
          stateCertainty: "proposed",
          workAuthorization: true,
          workAuthorizationStatus: "authorized"
        }
      }),
      prospect: sparseMayra(),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY,
      updateProspectFn: async (phone, patch) => {
        writes.push({ phone, patch });
      }
    });

    assert.equal(sync.ok, true);
    assert.deepEqual(writes[0]?.patch, { work_authorized: true });
  });

  test("identity / org mismatch soft-fails without write", async () => {
    const writes = [];
    const bad = await synchronizeQualificationFactsForMissionControl({
      durableContext: mayraDurable(),
      prospect: sparseMayra({ organization_id: "other-org" }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY,
      updateProspectFn: async (phone, patch) => {
        writes.push({ phone, patch });
      }
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reasonCode, SYNC_REASON.ORG_MISMATCH);
    assert.equal(writes.length, 0);
  });

  test("confirmed extractor ignores proposed city", () => {
    const facts = extractConfirmedDurableQualificationFacts({
      knownFacts: {
        city: "Davenport",
        state: "FL",
        cityCertainty: "proposed",
        stateCertainty: "confirmed",
        workAuthorization: true
      }
    });
    assert.equal(facts.city, null);
    assert.equal(facts.state, "FL");
    assert.equal(facts.authorization, true);
  });

  test("orchestrator wires BR-134 post-persist sync", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../core/recruitAiV2/orchestrator.js"),
      "utf8"
    );
    assert.match(src, /synchronizeQualificationFactsForMissionControl/);
    assert.match(src, /BR-134/);
  });

  test("execution remains OFF", () => {
    const {
      isExecutionEnabled
    } = require("../core/recruitAiV2/sideEffectAuthorizer");
    assert.equal(isExecutionEnabled(process.env), false);
  });
});

function normalizeStateLike(value) {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (s === "FLORIDA") return "FL";
  return s;
}
