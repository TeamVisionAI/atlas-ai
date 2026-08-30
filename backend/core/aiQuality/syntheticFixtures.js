/**
 * BR-175 — synthetic quality examples only. Do not mutate real prospects.
 */

const { SIGNAL_TYPES, SOURCE_ENGINES, CASE_STATUSES, SEVERITIES } = require("./constants");

const SYNTHETIC_ORG = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000bb";

function syntheticCases() {
  return [
    {
      id: "qa-insurance-condition",
      organizationId: SYNTHETIC_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2_SEMANTIC,
      signalType: SIGNAL_TYPES.SEMANTIC_OBJECTION_MISSED,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.HIGH,
      confidence: 0.91,
      legacyInterpretation: { intent: "unknown" },
      semanticInterpretation: {
        intent: "insurance_condition_objection",
        objections: [{ kind: "insurance_condition", detail: "not_about_insurance" }]
      },
      knownFactsBefore: {},
      knownFactsAfter: {},
      atlasAction: "ask_authorization",
      label: "insurance condition ignored before qualification"
    },
    {
      id: "qa-citizenship-repeat",
      organizationId: SYNTHETIC_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2,
      signalType: SIGNAL_TYPES.REPEATED_QUESTION,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.HIGH,
      confidence: 0.8,
      legacyInterpretation: { intent: "soft_acknowledgement" },
      semanticInterpretation: { intent: "provide_work_authorization" },
      knownFactsBefore: { workAuthorization: true, workAuthorizationStatus: "authorized" },
      knownFactsAfter: { workAuthorization: true, workAuthorizationStatus: "authorized" },
      atlasAction: "ask_authorization",
      label: "citizenship/work-auth repeated question"
    },
    {
      id: "qa-state-first",
      organizationId: SYNTHETIC_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2_SEMANTIC,
      signalType: SIGNAL_TYPES.SEMANTIC_DISAGREEMENT,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.MEDIUM,
      confidence: 0.86,
      legacyInterpretation: { intent: "unknown", facts: { city: "Sur carolina" } },
      semanticInterpretation: { intent: "provide_location", facts: { state: "SC" } },
      knownFactsBefore: {},
      knownFactsAfter: {},
      atlasAction: "ask_location",
      label: "state-first location misunderstanding"
    },
    {
      id: "qa-nl-reschedule",
      organizationId: SYNTHETIC_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2_SEMANTIC,
      signalType: SIGNAL_TYPES.RESCHEDULE_NOT_ACTED,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.HIGH,
      confidence: 0.9,
      legacyInterpretation: { intent: "unknown" },
      semanticInterpretation: { intent: "reschedule_request", schedulingIntent: "reschedule" },
      knownFactsBefore: {},
      knownFactsAfter: {},
      atlasAction: "ask_time",
      label: "natural-language reschedule"
    },
    {
      id: "qa-ssn-privacy",
      organizationId: SYNTHETIC_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2_SEMANTIC,
      signalType: SIGNAL_TYPES.SEMANTIC_OBJECTION_MISSED,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.HIGH,
      confidence: 0.88,
      legacyInterpretation: { intent: "unknown" },
      semanticInterpretation: {
        intent: "ssn_privacy_objection",
        safety: { ssnPrivacy: true, optOut: false, humanRequired: false }
      },
      knownFactsBefore: { workAuthorization: true },
      knownFactsAfter: { workAuthorization: true },
      atlasAction: "ask_authorization",
      label: "SSN/privacy objection"
    },
    {
      id: "qa-repeat-complaint",
      organizationId: SYNTHETIC_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2,
      signalType: SIGNAL_TYPES.REPEATED_QUESTION_COMPLAINT,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.HIGH,
      confidence: 0.7,
      legacyInterpretation: { intent: "unknown" },
      semanticInterpretation: { intent: "frustration" },
      knownFactsBefore: { city: "Bluffton", state: "SC" },
      knownFactsAfter: { city: "Bluffton", state: "SC" },
      atlasAction: "ask_location",
      label: "repeated question complaint"
    },
    {
      id: "qa-human-required-auto",
      organizationId: SYNTHETIC_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2,
      signalType: SIGNAL_TYPES.HUMAN_REQUIRED_THEN_QUALIFICATION,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.HIGH,
      confidence: 0.6,
      legacyInterpretation: { intent: "soft_acknowledgement" },
      semanticInterpretation: { intent: "soft_acknowledgement" },
      knownFactsBefore: {},
      knownFactsAfter: {},
      atlasAction: "ask_name",
      label: "HUMAN_REQUIRED followed by attempted automation"
    },
    {
      id: "qa-other-tenant",
      organizationId: OTHER_ORG,
      prospectId: null,
      ownerUserId: null,
      sourceEngine: SOURCE_ENGINES.RECRUIT_AI_V2_SEMANTIC,
      signalType: SIGNAL_TYPES.SEMANTIC_DISAGREEMENT,
      status: CASE_STATUSES.NEW,
      severity: SEVERITIES.LOW,
      confidence: 0.75,
      legacyInterpretation: { intent: "unknown" },
      semanticInterpretation: { intent: "provide_location" },
      knownFactsBefore: {},
      knownFactsAfter: {},
      atlasAction: "ask_location",
      label: "other-tenant isolation fixture"
    }
  ];
}

module.exports = {
  SYNTHETIC_ORG,
  OTHER_ORG,
  syntheticCases
};
