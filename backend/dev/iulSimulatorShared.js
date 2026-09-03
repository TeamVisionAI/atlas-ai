/**
 * BR-223 — Shared constants and fixtures for IUL Policy Review Workflow Simulator.
 */

"use strict";

const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const { meetingModeFacts, CONVERSATION_GOAL, CAMPAIGN_KIND } = require("../core/recruitAiV2/iulAdConversation");
const { INTAKE_CODE_STATUS } = require("../core/campaignIntakeCode/constants");
const { IUL_STAGES } = require("../core/iulWorkflowConstants");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const IUL_CODE = "TVI-0824-VNC8";
const TEST_NOW = "2026-09-02T16:00:00.000Z";
const OFFICE_ADDRESS = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

const FRESH_IUL_INTAKE_MATCH = Object.freeze({
  matched: true,
  purpose: "IUL",
  status: INTAKE_CODE_STATUS.ACTIVE,
  iulReviewEligible: true,
  recruitingEligible: false,
  code: IUL_CODE
});

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

const MULTI_DAY_SLOTS = Object.freeze([
  slot("2026-09-03", "09:00"),
  slot("2026-09-03", "12:00"),
  slot("2026-09-04", "09:00"),
  slot("2026-09-04", "12:00"),
  slot("2026-09-05", "10:00"),
  slot("2026-09-06", "11:00"),
  slot("2026-09-07", "09:00")
]);

function researchFacts(mode = null) {
  return {
    name: "Eladio",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_RESEARCH,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_GROWTH,
    reviewReason: IUL_OPTION_IDS.REVIEW_GROWTH,
    iulWorkflowStage: IUL_STAGES.REVIEW_READY,
    ...(mode
      ? meetingModeFacts(mode, {
          organizationId: TEAM_VISION_ORG,
          knownFacts: { reviewOfficeAddress: OFFICE_ADDRESS },
          _officeLocation: { fullAddress: OFFICE_ADDRESS }
        })
      : {})
  };
}

function activeFacts(mode = "zoom") {
  return {
    name: "Ana",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_UNDERSTAND,
    iulPolicyActive: true,
    policyType: "IUL",
    carrier: "National Life",
    carrierResolved: true,
    policyAgeRange: "3-5",
    documentsAvailable: true,
    iulWorkflowStage: IUL_STAGES.REVIEW_READY,
    ...meetingModeFacts(mode, {
      organizationId: TEAM_VISION_ORG,
      knownFacts: { reviewOfficeAddress: OFFICE_ADDRESS },
      _officeLocation: { fullAddress: OFFICE_ADDRESS }
    }),
    reviewOfficeAddress: OFFICE_ADDRESS
  };
}

function defaultIulSeed(overrides = {}) {
  return {
    preferredLanguage: "spanish",
    languageSource: "inferred",
    organizationId: TEAM_VISION_ORG,
    agentId: AGENT_ID,
    prospectOwnerUserId: AGENT_ID,
    testNow: TEST_NOW,
    timezone: "America/New_York",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    knownFacts: {},
    ...overrides
  };
}

function intakeTurn(text = `Hola, quiero revisar mi póliza IUL. ${IUL_CODE}`) {
  return {
    id: "intake",
    text,
    campaignIntakeMatch: FRESH_IUL_INTAKE_MATCH
  };
}

function interactiveTurn(id, optionId, title, extra = {}) {
  return {
    id,
    text: title,
    interactiveReply: { type: "button_reply", id: optionId, title },
    ...extra
  };
}

function listInteractiveTurn(id, optionId, title, extra = {}) {
  return {
    id,
    text: title,
    interactiveReply: { type: "list_reply", id: optionId, title },
    ...extra
  };
}

module.exports = {
  TEAM_VISION_ORG,
  AGENT_ID,
  IUL_CODE,
  TEST_NOW,
  OFFICE_ADDRESS,
  FRESH_IUL_INTAKE_MATCH,
  MULTI_DAY_SLOTS,
  researchFacts,
  activeFacts,
  defaultIulSeed,
  intakeTurn,
  interactiveTurn,
  listInteractiveTurn,
  IUL_OPTION_IDS
};
