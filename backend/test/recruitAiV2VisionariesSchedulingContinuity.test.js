/**
 * Team Visionaries canary — shared recruiting scheduling / in-person continuity.
 * Implements BR-229 rules 8–9 and BR-225 address-only office copy.
 * Does not change Team Visionaries production config, IUL, or booking writes.
 */

"use strict";

require("dotenv").config();

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  decideConversationTurn,
  resolveMeetingModalityForLocation
} = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { READ_STATUS } = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { extractOfficeCity } = require("../core/officeAddressResolver");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const {
  looksLikeOfficeHoursQuestion,
  looksLikeAvailableDaysQuestion
} = require("../core/recruitAiV2/conversationContinuity");
const { runRecruitAiV2ScenarioById } = require("../dev/recruitAiV2ScenarioPack");
const {
  collectAvailableDays,
  selectIulDayPage
} = require("../core/recruitAiV2/iulDayFirstScheduling");

const VISIONARIES_ORG = "aa045173-5eee-4c6e-978c-cc2f6125be29";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OFFICE =
  "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const OFFICE_NO_COMMAS = "2500 NW 79th Ave Suite 189 Doral Fl 33122";
const GENERIC_FALLBACK =
  "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?";
const STALE_TIME = /esa hora|ese d[ií]a|that time|that day/i;
const FIXED_NOW = new Date("2026-09-04T15:00:00.000-04:00");
const WEDNESDAY = "2026-09-09";
const THURSDAY = "2026-09-10";

const MORNING_DAYS = [
  {
    date: WEDNESDAY,
    dateKey: WEDNESDAY,
    time: "10:00",
    timeKey: "10:00",
    timezone: "America/New_York"
  },
  {
    date: THURSDAY,
    dateKey: THURSDAY,
    time: "09:30",
    timeKey: "09:30",
    timezone: "America/New_York"
  }
];

function morningAvailability(overrides = {}) {
  return {
    status: READ_STATUS.AVAILABLE,
    checked: true,
    rolling: true,
    nearestAlternatives: MORNING_DAYS,
    requestedSlotAvailable: false,
    ...overrides
  };
}

function zeroAvailability(overrides = {}) {
  return {
    status: READ_STATUS.ZERO_SLOTS,
    checked: true,
    rolling: true,
    nearestAlternatives: [],
    requestedSlotAvailable: false,
    ...overrides
  };
}

function visionariesContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    organizationId: VISIONARIES_ORG,
    organizationName: "Team Visionaries",
    localCities: [],
    officeAddress: OFFICE,
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "OUTSIDE",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "zoom",
      meetingPreferenceSource: "coverage_default",
      organizationId: VISIONARIES_ORG,
      localCities: []
    },
    appointment: {
      meetingType: "zoom",
      proposedDate: null,
      proposedTime: null,
      previouslyOfferedSlots: []
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Perfecto. Como estás en Miami, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?"
    },
    ...overrides
  });
}

function turn(text, context, availability = null) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function assertNoBlankOffice(text) {
  assert.doesNotMatch(text, /oficina está en\s*,/i);
  assert.doesNotMatch(text, /office is in\s*,/i);
  assert.doesNotMatch(text, /venir hasta\s*\?/i);
  assert.doesNotMatch(text, /coming to\s*\?/i);
}

test("docs: BR-229 hours / day-first and BR-225 address-only", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /Office \/ interview hours FAQ/);
  assert.match(rules, /Day-first when date is unknown/);
  assert.match(rules, /render the address only/);
});

test("A) Zoom → in-person request persists across later turns", () => {
  const first = turn("Puede ser presencial", visionariesContext());
  assert.equal(first.interpretation.intent, "provide_meeting_preference");
  assert.equal(first.nextContext.knownFacts.preferredMeetingType, "in_person");
  assert.equal(first.nextContext.knownFacts.meetingPreferenceSource, "prospect_requested");
  assert.equal(first.nextContext.knownFacts.meetingTypeRequested, "in_person");
  assertNoBlankOffice(first.rendered.text);

  const modality = resolveMeetingModalityForLocation({
    city: "Miami",
    state: "FL",
    organizationId: VISIONARIES_ORG,
    localCities: [],
    preferredMeetingType: "in_person",
    meetingPreferenceSource: "prospect_requested"
  });
  assert.equal(modality.meetingType, "in_person");
  assert.equal(modality.clearedStaleOffice, false);

  const later = turn(
    "En la mañana",
    first.nextContext,
    morningAvailability()
  );
  assert.equal(later.nextContext.knownFacts.preferredMeetingType, "in_person");
  assert.notEqual(later.nextContext.knownFacts.preferredMeetingType, "zoom");
  assert.doesNotMatch(later.rendered.text, /por Zoom|via Zoom/i);
});

test("B) missing friendly office label renders address only", () => {
  const rendered = renderCustomerReply({
    language: "spanish",
    templateKey: "confirm_in_person_travel_doral",
    organizationId: VISIONARIES_ORG,
    officeAddress: OFFICE_NO_COMMAS,
    entities: {
      organizationId: VISIONARIES_ORG,
      officeAddress: OFFICE_NO_COMMAS,
      preferredMeetingType: "in_person",
      meetingType: "in_person"
    }
  });
  assertNoBlankOffice(rendered.text);
  assert.match(rendered.text, /2500 NW 79th Ave/i);
  assert.doesNotMatch(rendered.text, /está en\s*,\s*en/i);

  const clean = renderCustomerReply({
    language: "spanish",
    templateKey: "confirm_in_person_travel_doral",
    organizationId: VISIONARIES_ORG,
    officeAddress: OFFICE,
    entities: {
      organizationId: VISIONARIES_ORG,
      officeAddress: OFFICE,
      preferredMeetingType: "in_person"
    }
  });
  assertNoBlankOffice(clean.text);
  assert.match(clean.text, /2500 NW 79th Ave, Suite 189, Doral, FL 33122/);

  assert.equal(extractOfficeCity(OFFICE), "Doral");
  assert.equal(extractOfficeCity(OFFICE_NO_COMMAS), "Doral");
});

test("C) a qué horas trabajas answers FAQ and keeps in-person context", () => {
  assert.equal(
    looksLikeOfficeHoursQuestion("Si quería estás allá o a qué horas trabajas"),
    true
  );
  const afterSwitch = turn("Puede ser presencial", visionariesContext());
  const hours = turn(
    "Si quería estás allá o a qué horas trabajas",
    afterSwitch.nextContext
  );
  assert.equal(hours.interpretation.intent, "office_hours_question");
  assert.match(hours.rendered.text, /mañana|tarde/i);
  assert.doesNotMatch(hours.rendered.text, new RegExp(GENERIC_FALLBACK.replace(/[—?]/g, ".")));
  assert.equal(hours.nextContext.knownFacts.preferredMeetingType, "in_person");
  assert.equal(
    hours.nextContext.conversation.lastQuestionAsked,
    "confirm_in_person_travel"
  );
  assertNoBlankOffice(hours.rendered.text);
  assert.match(hours.rendered.text, /oficina|2500 NW 79th/i);
});

test("D) En la mañana with no date uses day-first, not stale exact-time fallback", () => {
  const afterSwitch = turn("Puede ser presencial", visionariesContext());
  const morning = turn(
    "En la mañana",
    afterSwitch.nextContext,
    morningAvailability()
  );
  assert.equal(morning.interpretation.intent, "provide_day_part");
  assert.doesNotMatch(morning.rendered.text, STALE_TIME);
  assert.match(morning.rendered.text, /miércoles|jueves|Qué día/i);
  assert.ok(
    morning.structuredDecision.reasonCodes.includes("DAY_FIRST_AVAILABILITY_OFFERED") ||
      morning.structuredDecision.customerReplyPlan.entities.dayFirstOffer === true
  );
});

test("E) Que día puede ser returns available days", () => {
  assert.equal(looksLikeAvailableDaysQuestion("Que día puede ser"), true);
  const afterSwitch = turn("Puede ser presencial", visionariesContext());
  const ask = turn(
    "Que día puede ser",
    {
      ...afterSwitch.nextContext,
      knownFacts: {
        ...afterSwitch.nextContext.knownFacts,
        preferredDayPart: "morning"
      }
    },
    morningAvailability()
  );
  assert.equal(ask.interpretation.intent, "request_available_days");
  assert.doesNotMatch(ask.rendered.text, new RegExp(GENERIC_FALLBACK.replace(/[—?]/g, ".")));
  assert.doesNotMatch(ask.rendered.text, STALE_TIME);
  assert.match(ask.rendered.text, /miércoles|jueves|disponible/i);
});

test("F) Qué día puede ser en la mañana preserves morning filter", () => {
  const ask = turn(
    "Qué día puede ser en la mañana",
    visionariesContext({
      knownFacts: {
        ...visionariesContext().knownFacts,
        preferredMeetingType: "in_person",
        meetingPreferenceSource: "prospect_requested"
      },
      appointment: { meetingType: "in_person" },
      conversation: {
        lastQuestionAsked: "confirm_in_person_travel",
        pendingClarification: "confirm_in_person_travel"
      }
    }),
    morningAvailability()
  );
  assert.equal(ask.interpretation.intent, "request_available_days");
  assert.equal(ask.interpretation.entities.dayPart, "morning");
  assert.match(ask.rendered.text, /mañana/i);
  assert.doesNotMatch(ask.rendered.text, STALE_TIME);
  assert.equal(
    ask.nextContext.knownFacts.preferredDayPart ||
      ask.structuredDecision.customerReplyPlan.entities.dayPart,
    "morning"
  );
});

test("G) zero availability has no esa hora/ese día when none exists", () => {
  const morning = turn(
    "En la mañana",
    visionariesContext({
      knownFacts: {
        ...visionariesContext().knownFacts,
        preferredMeetingType: "in_person",
        meetingPreferenceSource: "prospect_requested"
      }
    }),
    zeroAvailability()
  );
  assert.equal(
    morning.structuredDecision.decision.nextAction,
    "acknowledge_no_qualifying_availability"
  );
  assert.doesNotMatch(morning.rendered.text, STALE_TIME);
  assert.match(morning.rendered.text, /mañana|disponibilidad/i);
});

test("H) exact date + exact time scheduling still works", () => {
  const ctx = visionariesContext({
    knownFacts: {
      ...visionariesContext().knownFacts,
      preferredDayPart: "morning"
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastAtlasOutboundText: "¿Qué hora en la mañana te funciona mejor?"
    }
  });
  const exact = turn("el miércoles a las 10", ctx, {
    status: READ_STATUS.AVAILABLE,
    checked: true,
    rolling: false,
    requestedSlotAvailable: true,
    nearestAlternatives: [MORNING_DAYS[0]]
  });
  const text = exact.rendered.text;
  assert.match(text, /10:00|miércoles|SI/i);
  assert.doesNotMatch(text, /Tengo disponible el miércoles y el jueves/i);
});

test("I) human takeover suppresses Atlas", async () => {
  const previousEnv = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const tempFile = path.join(
    os.tmpdir(),
    `atlas-visionaries-takeover-${process.pid}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}workflowStateStore.js`) ||
      key.includes(`${path.sep}conversationsCenterOwnershipService.js`) ||
      key.includes(`${path.sep}communicationHub.js`)
    ) {
      delete require.cache[key];
    }
  }
  try {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const phone = "+17865551901";
    await takeOverConversation(phone, { reason: "take_over" });
    const prospect = {
      phone,
      current_step: "SCHEDULING",
      organization_id: VISIONARIES_ORG
    };
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
    assert.equal(
      await shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
      false
    );
  } finally {
    if (previousEnv == null) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousEnv;
    }
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
});

test("J) Team Visionaries configuration remains tenant-scoped", () => {
  const visionariesMiami = evaluateCoverage({
    city: "Miami",
    state: "FL",
    organizationId: VISIONARIES_ORG,
    localCities: []
  });
  assert.equal(visionariesMiami.coverage, "OUTSIDE");

  const teamVisionMiami = evaluateCoverage({
    city: "Miami",
    state: "FL",
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.equal(teamVisionMiami.coverage, "LOCAL");

  const other = renderCustomerReply({
    language: "spanish",
    templateKey: "confirm_in_person_travel_doral",
    organizationId: OTHER_ORG,
    officeAddress: null,
    entities: { organizationId: OTHER_ORG, officeAddress: null }
  });
  assert.doesNotMatch(other.text, /2500 NW 79th/i);
  assertNoBlankOffice(other.text);
});

test("K) Team Vision / other tenant scheduling regression remains green", () => {
  assert.equal(runRecruitAiV2ScenarioById("orlando-clean-zoom-path").pass, true);
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-outside-clears-stale-office").pass,
    true
  );
  assert.equal(
    runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation").pass,
    true
  );
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-scheduling-date-change-cancellation").pass,
    true
  );
});

test("L) IUL scheduling regression remains green", () => {
  const slots = [
    { date: "2026-09-09", dateKey: "2026-09-09", time: "10:00", timeKey: "10:00" },
    { date: "2026-09-10", dateKey: "2026-09-10", time: "14:00", timeKey: "14:00" }
  ];
  const days = collectAvailableDays(slots);
  assert.deepEqual(
    days.map((day) => day.dateKey),
    ["2026-09-09", "2026-09-10"]
  );
  const page = selectIulDayPage(days);
  assert.equal(page.shown.length, 2);
  assert.equal(page.includeMore, false);
});
