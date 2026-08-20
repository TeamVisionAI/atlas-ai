/**
 * C2 — Recruiting config UI helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECRUITING_INTERVIEW_MODES,
  RECRUITING_LANGUAGES,
  QUALIFICATION_FIELD_IDS
} from "../../config/recruitingConfigConstants.js";
import {
  addFaqEntry,
  addLocalCity,
  assertCanonicalFieldIds,
  buildRecruitingConfigPatch,
  buildSupportModeTenantLabel,
  containsForbiddenRecruitingKey,
  faqIdsAreUnique,
  formatRecruitingConfigError,
  removeFaqEntry,
  removeLocalCity,
  shouldShowDefaultTemplateNotice,
  updateFaqEntry
} from "./recruitingConfigHelpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recruitingPageSource = fs.readFileSync(
  path.join(__dirname, "RecruitingConfiguration.jsx"),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.join(__dirname, "../../services/recruitingConfigService.js"),
  "utf8"
);

const sampleConfig = {
  schemaVersion: 1,
  profile: {
    industry: "insurance",
    businessName: "Acme",
    recruitingObjective: "Grow team",
    defaultLanguage: "en",
    supportedLanguages: ["en"],
    tone: "professional"
  },
  coverage: {
    officeAddress: "123 Main",
    localCities: ["miami"],
    localRadiusMiles: 25,
    defaultInterviewMode: "zoom"
  },
  qualification: {
    fieldOrder: [...QUALIFICATION_FIELD_IDS],
    requiredFields: ["city"],
    disqualifiers: [],
    questions: [{ fieldId: "city", text_en: "City?", text_es: "¿Ciudad?" }]
  },
  scheduling: {
    appointmentPurpose: "recruiting_interview",
    durationMinutes: 30,
    allowedModes: ["zoom"]
  },
  conversation: {
    openingInstructions: { en: "Hi", es: "Hola" },
    faq: [{ id: "pay", keywords: ["pay"], response_en: "Paid", response_es: "Pagado" }],
    handoffDisplayName: "Acme",
    objectionKeys: ["think_about_it"]
  }
};

describe("recruitingConfigHelpers (C2)", () => {
  it("buildRecruitingConfigPatch sends only changed sections", () => {
    const draft = structuredClone(sampleConfig);
    draft.profile.businessName = "Acme Updated";

    const patch = buildRecruitingConfigPatch(sampleConfig, draft);
    assert.deepEqual(Object.keys(patch), ["profile"]);
    assert.equal(patch.profile.businessName, "Acme Updated");
    assert.equal(patch.organizationId, undefined);
  });

  it("DEFAULT_TEMPLATE notice predicate", () => {
    assert.equal(
      shouldShowDefaultTemplateNotice({ source: "DEFAULT_TEMPLATE", persisted: false }),
      true
    );
    assert.equal(shouldShowDefaultTemplateNotice({ source: "PERSISTED", persisted: true }), false);
  });

  it("Support Mode tenant label helper", () => {
    assert.equal(buildSupportModeTenantLabel("Team Vision"), "Configuring: Team Vision");
  });

  it("FAQ add/edit/delete helpers work", () => {
    let faq = [{ id: "a", keywords: [], response_en: "", response_es: "" }];
    faq = addFaqEntry(faq, { id: "b", keywords: ["x"], response_en: "EN", response_es: "ES" });
    assert.equal(faq.length, 2);
    faq = updateFaqEntry(faq, 1, { response_en: "Updated" });
    assert.equal(faq[1].response_en, "Updated");
    faq = removeFaqEntry(faq, 0);
    assert.deepEqual(faq.map((entry) => entry.id), ["b"]);
    assert.equal(faqIdsAreUnique(faq), true);
    assert.equal(faqIdsAreUnique([{ id: "dup" }, { id: "dup" }]), false);
  });

  it("localCities editor helpers work", () => {
    let cities = addLocalCity([], "Miami");
    cities = addLocalCity(cities, "miami");
    assert.deepEqual(cities, ["Miami"]);
    cities = removeLocalCity(cities, "Miami");
    assert.deepEqual(cities, []);
  });

  it("unsupported arbitrary field id cannot be introduced through helpers", () => {
    assert.equal(assertCanonicalFieldIds(["city", "customField"]), false);
    assert.equal(assertCanonicalFieldIds(["city", "email"]), true);
    assert.equal(containsForbiddenRecruitingKey({ systemPrompt: "hack" }).includes("systemPrompt"), true);
  });

  it("language and mode controls stay constrained to canonical values", () => {
    assert.deepEqual(RECRUITING_LANGUAGES, ["es", "en"]);
    assert.deepEqual(RECRUITING_INTERVIEW_MODES, ["in_person", "zoom"]);
    assert.match(recruitingPageSource, /RECRUITING_LANGUAGES/);
    assert.match(recruitingPageSource, /RECRUITING_INTERVIEW_MODES/);
  });

  it("validation errors include API details", () => {
    const formatted = formatRecruitingConfigError({
      message: "Recruiting config is invalid",
      details: ["profile.businessName is required"]
    });
    assert.match(formatted, /profile.businessName is required/);
  });

  it("PATCH service does not send organizationId", () => {
    assert.match(serviceSource, /\/api\/organization\/recruiting-config/);
    assert.doesNotMatch(serviceSource, /organizationId/);
    assert.doesNotMatch(recruitingPageSource, /organizationId/);
  });
});
