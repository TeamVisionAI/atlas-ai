/**
 * C1 — Recruiting configuration contract (data/API only).
 * Canonical Atlas field ids; tenants cannot invent engine field ids.
 */

const SCHEMA_VERSION = 1;

const CONFIG_SOURCES = Object.freeze({
  DEFAULT_TEMPLATE: "DEFAULT_TEMPLATE",
  PERSISTED: "PERSISTED"
});

const ALLOWED_TOP_LEVEL_SECTIONS = Object.freeze([
  "schemaVersion",
  "profile",
  "coverage",
  "qualification",
  "scheduling",
  "conversation"
]);

const INDUSTRIES = Object.freeze(["insurance", "real_estate", "mortgage", "other"]);
const LANGUAGES = Object.freeze(["es", "en"]);
const TONES = Object.freeze(["professional", "warm", "conversational"]);
const INTERVIEW_MODES = Object.freeze(["in_person", "zoom"]);

/** Atlas-owned qualification field ids (informationModel FIELD_ORDER). */
const QUALIFICATION_FIELD_IDS = Object.freeze([
  "city",
  "state",
  "authorization",
  "interviewType",
  "dayPart",
  "schedule",
  "name",
  "email"
]);

const PRE_SCHEDULE_FIELD_IDS = Object.freeze([
  "city",
  "state",
  "authorization",
  "interviewType",
  "dayPart"
]);

const FORBIDDEN_CONFIG_KEYS = Object.freeze([
  "systemPrompt",
  "system_prompt",
  "scripts",
  "script",
  "code",
  "executable",
  "workflowBuilder",
  "workflow_builder",
  "organizationId",
  "organization_id"
]);

const LIMITS = Object.freeze({
  shortText: 200,
  mediumText: 500,
  longText: 2000,
  maxKeywords: 40,
  maxKeywordLength: 80,
  maxFaqEntries: 40,
  maxCities: 80,
  maxQuestions: 16,
  maxDisqualifiers: 8,
  maxObjectionKeys: 20,
  maxSupportedLanguages: 2
});

const TEAM_VISION_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

module.exports = {
  SCHEMA_VERSION,
  CONFIG_SOURCES,
  ALLOWED_TOP_LEVEL_SECTIONS,
  INDUSTRIES,
  LANGUAGES,
  TONES,
  INTERVIEW_MODES,
  QUALIFICATION_FIELD_IDS,
  PRE_SCHEDULE_FIELD_IDS,
  FORBIDDEN_CONFIG_KEYS,
  LIMITS,
  TEAM_VISION_ORGANIZATION_ID
};
