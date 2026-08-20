/**
 * C2 — Recruiting configuration UI constants (mirrors backend/core/recruitingConfig/constants.js).
 */

export const RECRUITING_SCHEMA_VERSION = 1;

export const RECRUITING_CONFIG_SOURCES = Object.freeze({
  DEFAULT_TEMPLATE: "DEFAULT_TEMPLATE",
  PERSISTED: "PERSISTED"
});

export const RECRUITING_INDUSTRIES = Object.freeze(["insurance", "real_estate", "mortgage", "other"]);

export const RECRUITING_LANGUAGES = Object.freeze(["es", "en"]);

export const RECRUITING_TONES = Object.freeze(["professional", "warm", "conversational"]);

export const RECRUITING_INTERVIEW_MODES = Object.freeze(["in_person", "zoom"]);

export const QUALIFICATION_FIELD_IDS = Object.freeze([
  "city",
  "state",
  "authorization",
  "interviewType",
  "dayPart",
  "schedule",
  "name",
  "email"
]);

export const RECRUITING_TOP_LEVEL_SECTIONS = Object.freeze([
  "schemaVersion",
  "profile",
  "coverage",
  "qualification",
  "scheduling",
  "conversation"
]);

export const FORBIDDEN_RECRUITING_CONFIG_KEYS = Object.freeze([
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

export const DISQUALIFIER_ACTIONS = Object.freeze(["current_not_fit"]);

export const KNOWN_OBJECTION_KEYS = Object.freeze([
  "is_this_sales",
  "think_about_it",
  "legitimacy_trust",
  "recruit_role_objection",
  "network_objection"
]);
