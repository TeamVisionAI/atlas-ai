/**
 * BR-223 — IUL Policy Review Workflow Simulator scenario definitions (A–P).
 * Ephemeral dry-run scenarios use fixture availability; staging E2E uses live calendar.
 */

"use strict";

const { ASK } = require("../core/recruitAiV2/iulAdConversation");
const { REASON_CODES, APPOINTMENT_STATUS } = require("../core/recruitAiV2/constants");
const { IUL_SLOT_MORE_ID } = require("../core/recruitAiV2/iulSlotSelection");
const {
  iulDaySelectionId,
  formatIulDayTitle,
  IUL_DAY_MORE_ID
} = require("../core/recruitAiV2/iulDayFirstScheduling");
const {
  defaultIulSeed,
  intakeTurn,
  interactiveTurn,
  listInteractiveTurn,
  MULTI_DAY_SLOTS,
  researchFacts,
  activeFacts,
  IUL_OPTION_IDS,
  TEST_NOW,
  OFFICE_ADDRESS
} = require("./iulSimulatorShared");

const AVAILABILITY_FIXTURE = { slots: MULTI_DAY_SLOTS };

const IUL_POLICY_REVIEW_SCENARIOS = [
  {
    id: "iul-research-growth-zoom",
    name: "A. IUL Research → Growth → Zoom",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({ availabilityFixture: AVAILABILITY_FIXTURE }),
    turns: [
      intakeTurn(),
      interactiveTurn("status", IUL_OPTION_IDS.STATUS_RESEARCH, "Estoy buscando información"),
      interactiveTurn("intent", IUL_OPTION_IDS.REVIEW_GROWTH, "Crecimiento"),
      interactiveTurn("mode", IUL_OPTION_IDS.MEET_ZOOM, "Por Zoom", {
        expect: { hasDayPicker: true, meetingMode: "zoom" }
      })
    ]
  },
  {
    id: "iul-research-growth-office",
    name: "B. IUL Research → Growth → Office",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({ availabilityFixture: AVAILABILITY_FIXTURE }),
    turns: [
      intakeTurn(),
      interactiveTurn("status", IUL_OPTION_IDS.STATUS_RESEARCH, "Estoy buscando información"),
      interactiveTurn("intent", IUL_OPTION_IDS.REVIEW_GROWTH, "Crecimiento"),
      interactiveTurn("mode", IUL_OPTION_IDS.MEET_OFFICE, "En la oficina", {
        expect: { hasDayPicker: true, meetingMode: "in_person" }
      })
    ]
  },
  {
    id: "iul-active-policy-zoom",
    name: "C. IUL Active Policy → Zoom",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: activeFacts("zoom"),
      conversation: { lastQuestionAsked: ASK.MEETING_MODE }
    }),
    turns: [
      intakeTurn(),
      interactiveTurn("mode", IUL_OPTION_IDS.MEET_ZOOM, "Por Zoom", {
        expect: { hasDayPicker: true, iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE }
      })
    ]
  },
  {
    id: "iul-unsure-review",
    name: "D. IUL Unsure → Review",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed(),
    turns: [
      intakeTurn(),
      interactiveTurn("status", IUL_OPTION_IDS.STATUS_UNSURE, "No estoy seguro qué tengo", {
        expect: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_UNSURE }
      })
    ]
  },
  {
    id: "iul-day-picker",
    name: "E. IUL Day Picker",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: researchFacts("zoom"),
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY }
    }),
    turns: [
      {
        id: "assert-day-picker",
        text: "Por Zoom",
        interactiveReply: { type: "button_reply", id: IUL_OPTION_IDS.MEET_ZOOM, title: "Por Zoom" },
        setup: { availabilityFixture: AVAILABILITY_FIXTURE },
        expect: { hasDayPicker: true, lastQuestionAsked: ASK.SCHEDULING_DAY }
      }
    ]
  },
  {
    id: "iul-daypart-selection",
    name: "F. IUL Daypart Selection",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: researchFacts("zoom"),
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAYPART }
    }),
    turns: [
      listInteractiveTurn("day", iulDaySelectionId("2026-09-03"), formatIulDayTitle("2026-09-03", "es"), {
        setup: { availabilityFixture: AVAILABILITY_FIXTURE },
        expect: { selectedDate: "2026-09-03" }
      }),
      interactiveTurn("daypart", IUL_OPTION_IDS.DAY_MORNING, "En la mañana", {
        expect: { preferredDayPart: "morning", compactSlotCountMin: 1 }
      })
    ]
  },
  {
    id: "iul-compact-slots",
    name: "G. IUL Compact Slots",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: {
        ...researchFacts("zoom"),
        iulSelectedDate: "2026-09-03",
        preferredDayPart: "morning"
      },
      conversation: { lastQuestionAsked: ASK.SCHEDULING_SLOT }
    }),
    turns: [
      interactiveTurn("daypart", IUL_OPTION_IDS.DAY_MORNING, "En la mañana", {
        setup: { availabilityFixture: AVAILABILITY_FIXTURE },
        expect: { compactSlotCountMin: 2, compactSlotCountMax: 3 }
      })
    ]
  },
  {
    id: "iul-more-hours",
    name: "H. IUL More Hours",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: {
        ...researchFacts("zoom"),
        iulSelectedDate: "2026-09-03",
        preferredDayPart: "morning"
      },
      conversation: { lastQuestionAsked: ASK.SCHEDULING_SLOT }
    }),
    turns: [
      interactiveTurn("more-hours", IUL_SLOT_MORE_ID, "Más horarios", {
        setup: { availabilityFixture: AVAILABILITY_FIXTURE },
        expect: { selectedDate: "2026-09-03", preferredDayPart: "morning" }
      })
    ]
  },
  {
    id: "iul-more-days",
    name: "I. IUL More Days",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: researchFacts("zoom"),
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY }
    }),
    turns: [
      interactiveTurn("more-days", IUL_DAY_MORE_ID, "Más días", {
        setup: { availabilityFixture: AVAILABILITY_FIXTURE },
        expect: { hasDayPicker: true }
      })
    ]
  },
  {
    id: "iul-mode-switch-zoom-office",
    name: "J. IUL Mode Switch Zoom → Office",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: researchFacts("zoom"),
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY }
    }),
    turns: [
      interactiveTurn("office", IUL_OPTION_IDS.MEET_OFFICE, "En la oficina", {
        setup: { availabilityFixture: AVAILABILITY_FIXTURE },
        expect: { meetingMode: "in_person", hasDayPicker: true, lastQuestionAsked: ASK.SCHEDULING_DAY }
      })
    ]
  },
  {
    id: "iul-mode-switch-office-zoom",
    name: "K. IUL Mode Switch Office → Zoom",
    category: "iul_policy_review",
    mode: "dry_run",
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: researchFacts("office"),
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY }
    }),
    turns: [
      interactiveTurn("zoom", IUL_OPTION_IDS.MEET_ZOOM, "Por Zoom", {
        setup: { availabilityFixture: AVAILABILITY_FIXTURE },
        expect: { meetingMode: "zoom", hasDayPicker: true }
      })
    ]
  },
  {
    id: "iul-fresh-intake-reset",
    name: "L. IUL Fresh Intake Reset (BR-222)",
    category: "iul_policy_review",
    mode: "dry_run",
    br: ["BR-222"],
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: researchFacts("zoom"),
      conversation: { lastQuestionAsked: ASK.RESEARCH_INTENT }
    }),
    turns: [
      intakeTurn(),
      {
        id: "fresh-reset",
        text: `Hola, quiero revisar mi póliza IUL. TVI-0824-VNC8`,
        campaignIntakeMatch: require("./iulSimulatorShared").FRESH_IUL_INTAKE_MATCH,
        expect: {
          reasonCodesInclude: REASON_CODES.IUL_FRESH_EPISODE_RESET,
          lastQuestionAsked: ASK.QUALIFICATION_STATUS,
          iulQualificationStatus: null
        }
      }
    ]
  },
  {
    id: "iul-booking-pending-deferred",
    name: "M. IUL Booking Pending / Deferred (BR-219)",
    category: "iul_policy_review",
    mode: "dry_run",
    br: ["BR-219"],
    seed: defaultIulSeed({
      availabilityFixture: AVAILABILITY_FIXTURE,
      knownFacts: {
        ...researchFacts("zoom"),
        iulSelectedSlot: MULTI_DAY_SLOTS[0]
      },
      appointment: { status: APPOINTMENT_STATUS.PENDING },
      conversation: { lastQuestionAsked: ASK.SCHEDULING_SLOT, bookingPending: true }
    }),
    turns: [
      {
        id: "pending-hold",
        text: "¿Cuándo es mi cita?",
        expect: { bookingPending: true, sideEffectsDenied: true }
      }
    ]
  },
  {
    id: "iul-confirmed-rehydrate",
    name: "N. IUL Confirmed Appointment Rehydrate",
    category: "iul_policy_review",
    mode: "dry_run",
    br: ["BR-219"],
    seed: defaultIulSeed({
      knownFacts: researchFacts("zoom"),
      appointment: {
        status: APPOINTMENT_STATUS.CONFIRMED,
        date: "2026-09-03",
        time: "09:00",
        meetingType: "virtual"
      }
    }),
    turns: [
      intakeTurn(),
      {
        id: "rehydrate",
        text: "Gracias",
        expect: { appointmentStatus: APPOINTMENT_STATUS.CONFIRMED, sideEffectsDenied: true }
      }
    ]
  },
  {
    id: "iul-full-golden-path",
    name: "O. Full IUL Golden Path",
    category: "iul_policy_review",
    mode: "dry_run",
    driver: "golden_path",
    br: ["BR-219", "BR-220", "BR-221", "BR-222"],
    seed: defaultIulSeed({ availabilityFixture: AVAILABILITY_FIXTURE })
  },
  {
    id: "iul-full-staging-e2e-zoom",
    name: "P. Full IUL Staging E2E (Zoom)",
    category: "iul_policy_review",
    mode: "staging_e2e",
    meetingMode: "zoom",
    driver: "staging_e2e",
    br: ["BR-219", "BR-220", "BR-221"]
  },
  {
    id: "iul-full-staging-e2e-office",
    name: "P. Full IUL Staging E2E (Office)",
    category: "iul_policy_review",
    mode: "staging_e2e",
    meetingMode: "in_person",
    driver: "staging_e2e",
    br: ["BR-219", "BR-220", "BR-221"]
  }
];

module.exports = {
  IUL_POLICY_REVIEW_SCENARIOS,
  AVAILABILITY_FIXTURE,
  TEST_NOW,
  OFFICE_ADDRESS
};
