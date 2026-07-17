/**
 * Sprint 8A.4a — Golden scenario scripts for workflow simulator.
 * Runs through real workflow modules and produces structured reports.
 */

const crypto = require("crypto");
const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");
const { createScenarioRecorder } = require("./scenarioRecorder");
const {
  createSimulatorProspect,
  simulateMessage,
  advanceSimulatorWorkflow,
  simulateStall,
  simulateInterview,
  buildFullWorkflowState,
  cleanupSimulatorProspect,
  getSimulatorEvents,
  reactivateSimulatorProspect
} = require("./workflowSimulatorService");
const { withSimulatorGuard } = require("./simulatorGuard");
const { clearSimulatedNow } = require("./simulatorClock");

const QUAL_FIELDS = {
  city: "Miami",
  state: "FL",
  authorization: true,
  occupation: "Sales",
  interviewType: "Zoom",
  email: "sim-golden@example.com"
};

async function runScenario(definition) {
  const phone = `sim-golden-${definition.id}-${crypto.randomUUID().slice(0, 8)}`;
  const recorder = createScenarioRecorder(definition.name);

  try {
    clearSimulatedNow();
    await cleanupSimulatorProspect(phone);

    const initial = await createSimulatorProspect({
      phone,
      name: definition.name,
      preset: definition.preset || "NEW_LEAD",
      seedFields: definition.seedFields,
      correlationId: recorder.correlationId
    });

    recorder.setInitialState(initial.workflow);
    recorder.setExpected(definition.expected);

    for (const step of definition.steps) {
      const result = await step({ phone, recorder });
      recorder.recordAction(step.name || "step", result);
      clearSimulatedNow();
    }

    const finalState = await buildFullWorkflowState(phone);
    const events = await getSimulatorEvents(phone, { limit: 100 });

    const actualResult = {
      success: true,
      canonicalMilestone: finalState?.workflow?.canonicalMilestone,
      workflowOwnership: finalState?.workflow?.workflowOwnership,
      needsHumanAttention: finalState?.workflow?.needsHumanAttention,
      missionControlPriorityTier: finalState?.workflow?.missionControlPriorityTier,
      eventCount: events.events?.length || 0,
      eventTypes: [...new Set((events.events || []).map((row) => row.event_type))]
    };

    recorder.eventsEmitted = actualResult.eventTypes;

    return recorder.finalize(finalState?.workflow, actualResult);
  } catch (error) {
    return recorder.finalize(null, {
      success: false,
      error: error.message
    });
  } finally {
    clearSimulatedNow();
  }
}

const GOLDEN_SCENARIOS = [
  {
    id: "01",
    name: "Happy path recruitment",
    preset: "NEW_LEAD",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.ORIENTATION,
      workflowOwnership: OWNERSHIP.ATLAS
    },
    steps: [
      async ({ phone }) =>
        simulateMessage({ phone, direction: "outgoing", body: "Hi! Welcome to Team Vision." }),
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.INTERVIEW_READY,
          capturedFields: { ...QUAL_FIELDS },
          interactionType: "phone"
        }),
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
          capturedFields: {
            ...QUAL_FIELDS,
            interviewDateTime: new Date(Date.now() + 86400000 * 3).toISOString()
          },
          interactionType: "phone"
        }),
      async ({ phone }) =>
        simulateInterview({
          phone,
          action: "fast_forward"
        }),
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.ORIENTATION,
          capturedFields: { outcome: "Recruited" },
          interactionType: "phone"
        })
    ]
  },
  {
    id: "02",
    name: "Zoom interview",
    preset: "QUALIFICATION",
    seedFields: { city: "Miami", state: "FL" },
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      workflowOwnership: OWNERSHIP.WAITING_EVENT
    },
    steps: [
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
          capturedFields: {
            ...QUAL_FIELDS,
            interviewType: "Zoom",
            email: "zoom@example.com",
            interviewDateTime: new Date(Date.now() + 172800000).toISOString()
          },
          interactionType: "phone"
        })
    ]
  },
  {
    id: "03",
    name: "In-person interview",
    preset: "QUALIFICATION",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED
    },
    steps: [
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
          capturedFields: {
            city: "Doral",
            state: "FL",
            authorization: true,
            occupation: "Teacher",
            interviewType: "In Person",
            interviewDateTime: new Date(Date.now() + 86400000).toISOString()
          },
          interactionType: "phone"
        })
    ]
  },
  {
    id: "04",
    name: "Prospect stops replying",
    preset: "NEW_LEAD",
    expected: {
      success: true,
      needsHumanAttention: true,
      workflowOwnership: OWNERSHIP.AGENT
    },
    steps: [
      async ({ phone }) =>
        simulateMessage({ phone, direction: "outgoing", body: "What is your occupation?" }),
      async ({ phone }) => simulateStall({ phone, mode: "advance_24h" })
    ]
  },
  {
    id: "05",
    name: "Human calls and advances prospect",
    preset: "STALLED",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      needsHumanAttention: false
    },
    steps: [
      async ({ phone }) =>
        simulateMessage({ phone, direction: "outgoing", body: "Are you still interested?" }),
      async ({ phone }) => simulateStall({ phone, mode: "advance_24h" }),
      async ({ phone }) => {
        clearSimulatedNow();
        return advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
          capturedFields: {
            ...QUAL_FIELDS,
            interviewDateTime: new Date(Date.now() + 86400000 * 3).toISOString()
          },
          interactionType: "phone",
          interactionNotes: "Human call — scheduled interview"
        });
      }
    ]
  },
  {
    id: "06",
    name: "Interview no-show",
    preset: "INTERVIEW_SCHEDULED",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.FOLLOW_UP
    },
    steps: [
      async ({ phone }) =>
        simulateInterview({ phone, action: "fast_forward" }),
      async ({ phone }) =>
        simulateInterview({
          phone,
          action: "record_outcome",
          outcome: "No Show",
          followUpDate: new Date(Date.now() + 604800000).toISOString().slice(0, 10)
        })
    ]
  },
  {
    id: "07",
    name: "Follow-up scheduled",
    preset: "QUALIFICATION",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.FOLLOW_UP
    },
    steps: [
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.FOLLOW_UP,
          capturedFields: {
            followUpDate: new Date(Date.now() + 604800000).toISOString().slice(0, 10),
            followUpTime: "10:00"
          },
          interactionType: "phone"
        })
    ]
  },
  {
    id: "08",
    name: "Prospect closed",
    preset: "QUALIFICATION",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.CLOSED,
      workflowOwnership: OWNERSHIP.CLOSED
    },
    steps: [
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.CLOSED,
          capturedFields: { closureReason: "Not interested" },
          interactionType: "phone"
        })
    ]
  },
  {
    id: "09",
    name: "Do Not Contact",
    preset: "QUALIFICATION",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.DO_NOT_CONTACT,
      workflowOwnership: OWNERSHIP.CLOSED
    },
    steps: [
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.DO_NOT_CONTACT,
          capturedFields: { doNotContactReason: "Requested DNC" },
          interactionType: "phone"
        })
    ]
  },
  {
    id: "10",
    name: "Prospect reactivation",
    preset: "QUALIFICATION",
    expected: {
      success: true,
      canonicalMilestone: MILESTONES.FOLLOW_UP
    },
    steps: [
      async ({ phone }) =>
        advanceSimulatorWorkflow(phone, {
          targetMilestone: MILESTONES.CLOSED,
          capturedFields: { closureReason: "Not ready" },
          interactionType: "phone"
        }),
      async ({ phone }) =>
        reactivateSimulatorProspect(phone, {
          targetMilestone: MILESTONES.FOLLOW_UP,
          capturedFields: {
            followUpDate: new Date(Date.now() + 259200000).toISOString().slice(0, 10)
          },
          interactionType: "phone",
          interactionNotes: "Agent reactivation — follow up scheduled"
        })
    ]
  }
];

async function runAllGoldenScenarios() {
  return withSimulatorGuard(async () => {
    const reports = [];

    for (const definition of GOLDEN_SCENARIOS) {
      const report = await runScenario({
        ...definition,
        steps: definition.steps.map((fn, index) => {
          const wrapped = (ctx) => fn(ctx);
          wrapped.name = `${definition.id}-step-${index + 1}`;
          return wrapped;
        })
      });
      reports.push(report);
    }

    return {
      simulator: true,
      ranAt: new Date().toISOString(),
      total: reports.length,
      passed: reports.filter((row) => row.pass).length,
      failed: reports.filter((row) => !row.pass).length,
      reports
    };
  });
}

module.exports = {
  GOLDEN_SCENARIOS,
  runScenario,
  runAllGoldenScenarios
};
