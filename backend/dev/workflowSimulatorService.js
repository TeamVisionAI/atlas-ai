/**
 * Sprint 8A.4a — Workflow simulator service layer.
 * Reuses production workflow engines; no duplicated business logic.
 */

const {
  findProspect,
  createProspect,
  updateProspect,
  deleteProspect,
  supabase
} = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const { handleIncomingMessage } = require("../core/conversationEngine");
const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
const { buildWorkflowReadModel } = require("../core/workflowReadModel");
const { getMissionControlState } = require("../controllers/conversationController");
const { loadAgentState, deleteAgentState, mergeAgentState } = require("../core/agentActionState");
const {
  loadPersistedWorkflowState,
  deletePersistedWorkflowState,
  savePersistedWorkflowState
} = require("../core/workflowStateStore");
const { listWorkflowEvents } = require("../services/workflowEventService");
const { getConversationTimeline } = require("../services/timelineService");
const { buildPrioritizedWorkflowQueue } = require("../core/missionControlPriorityEngine");
const { emit, EVENT_TYPES } = require("../core/eventEngine");
const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");
const {
  assertSimulatorPhone,
  isSimulatorPhone,
  createSimulatorPhone
} = require("./simulatorSafety");
const { withSimulatorGuard } = require("./simulatorGuard");
const {
  setSimulatedNow,
  clearSimulatedNow,
  getSimulatedNowIso,
  isSimulatedClockActive
} = require("./simulatorClock");
const { createScenarioRecorder } = require("./scenarioRecorder");

const PRESET_SEEDS = {
  NEW_LEAD: {},
  QUALIFICATION: { city: "Miami", state: "FL" },
  INTERVIEW_SCHEDULED: {
    city: "Miami",
    state: "FL",
    work_authorized: true,
    occupation: "Sales",
    interview_type: "Zoom",
    interview_time: new Date(Date.now() + 86400000).toISOString(),
    appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    current_step: "CONFIRMED"
  },
  STALLED: { city: "Miami", state: "FL" },
  CLOSED: { current_step: "GREETING" }
};

function simulatorMeta(extra = {}) {
  return {
    simulator: true,
    simulatedAt: isSimulatedClockActive() ? getSimulatedNowIso() : null,
    ...extra
  };
}

async function buildFullWorkflowState(phone) {
  const prospect = await findProspect(phone);

  if (!prospect) {
    return null;
  }

  const missionControl = await getMissionControlState(phone);
  const agentState = loadAgentState(phone);
  const workflow = await buildWorkflowReadModel({
    prospect,
    brain: missionControl?.brain || {},
    agentState
  });

  return {
    phone,
    prospect,
    brain: missionControl?.brain || null,
    workflow,
    agentState: loadAgentState(phone),
    persistedWorkflow: loadPersistedWorkflowState(phone)
  };
}

async function deleteWorkflowEventsForPhone(phone) {
  const { error } = await supabase
    .from("workflow_events")
    .delete()
    .eq("prospect_phone", phone);

  if (error && error.code !== "42P01") {
    throw error;
  }
}

async function cleanupSimulatorProspect(phone) {
  assertSimulatorPhone(phone);
  await deleteWorkflowEventsForPhone(phone);
  deletePersistedWorkflowState(phone);
  deleteAgentState(phone);

  try {
    await deleteProspect(phone);
  } catch {
    // Prospect may not exist
  }
}

async function createSimulatorProspect(payload = {}) {
  return withSimulatorGuard(async () => {
    const phone = payload.phone || createSimulatorPhone(payload.suffix || "test");
    assertSimulatorPhone(phone);

    await cleanupSimulatorProspect(phone);

    const name = payload.name || "Simulator Prospect";
    const preset = payload.preset || "NEW_LEAD";
    const seed = { ...PRESET_SEEDS[preset], ...(payload.seedFields || {}) };

    const prospect = await createProspect(phone, name, seed.last_message || "");

    if (Object.keys(seed).length > 0) {
      await updateProspect(phone, seed);
    }

    await emit(EVENT_TYPES.PROSPECT_CREATED, {
      prospectPhone: phone,
      actor: "SYSTEM",
      milestoneAfter: MILESTONES.NEW_LEAD,
      ownershipAfter: OWNERSHIP.ATLAS,
      payload: { source: "simulator", preset },
      correlationId: payload.correlationId || `sim-create:${phone}`
    });

    const state = await buildFullWorkflowState(phone);

    return simulatorMeta({
      prospect: state.prospect,
      workflow: state.workflow
    });
  });
}

async function simulateMessage(payload = {}) {
  return withSimulatorGuard(async () => {
    const phone = payload.phone;
    assertSimulatorPhone(phone);

    const direction = String(payload.direction || "incoming").toLowerCase();
    const body = String(payload.body || "").trim();

    if (!body) {
      const error = new Error("Message body is required.");
      error.code = "BODY_REQUIRED";
      throw error;
    }

    const prospect = await findProspect(phone);

    if (!prospect) {
      const error = new Error("Simulator prospect not found.");
      error.code = "PROSPECT_NOT_FOUND";
      throw error;
    }

    let reply = null;

    if (direction === "incoming") {
      const result = await handleIncomingMessage(phone, prospect.name, body, {
        channel: "simulator"
      });
      reply = typeof result === "string" ? result : result?.reply || null;
    } else if (payload.asAtlas) {
      const result = await handleIncomingMessage(phone, prospect.name, body, {
        channel: "simulator"
      });
      reply = typeof result === "string" ? result : result?.reply || null;
    } else {
      await logConversation({
        phone,
        name: prospect.name,
        direction: "outgoing",
        message: body,
        intent: "SIMULATOR",
        pipeline: "SIMULATOR",
        currentStep: prospect.current_step || "SIMULATOR",
        language: prospect.language || "en",
        city: prospect.city,
        state: prospect.state
      });
      reply = body;
    }

    const state = await buildFullWorkflowState(phone);

    return simulatorMeta({
      phone,
      direction,
      reply,
      workflow: state.workflow,
      brain: state.brain
    });
  });
}

async function advanceSimulatorWorkflow(phone, body = {}) {
  return withSimulatorGuard(async () => {
    assertSimulatorPhone(phone);
    const result = await advanceProspectWorkflow(phone, body);
    const state = await buildFullWorkflowState(phone);

    return simulatorMeta({
      ...result,
      workflow: state.workflow
    });
  });
}

async function simulateStall(payload = {}) {
  return withSimulatorGuard(async () => {
    const phone = payload.phone;
    assertSimulatorPhone(phone);
    const mode = payload.mode || "advance_24h";

    if (mode === "reset") {
      clearSimulatedNow();
      const state = await buildFullWorkflowState(phone);
      return simulatorMeta({ mode, workflow: state.workflow });
    }

    const { data: logs, error } = await supabase
      .from("conversation_logs")
      .select("id, created_at, direction")
      .eq("prospect_phone", phone)
      .eq("direction", "outgoing")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    const lastOutbound = logs?.[0];

    if (!lastOutbound) {
      const error = new Error("No Atlas outbound message found for stall simulation.");
      error.code = "NO_OUTBOUND";
      throw error;
    }

    if (mode === "backdate_outbound") {
      if (!payload.confirm) {
        const error = new Error("backdate_outbound requires confirm: true");
        error.code = "CONFIRM_REQUIRED";
        throw error;
      }

      const backdated = new Date(Date.parse(lastOutbound.created_at) - 25 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("conversation_logs")
        .update({ created_at: backdated })
        .eq("id", lastOutbound.id);
    } else {
      const simulatedAt = new Date(Date.parse(lastOutbound.created_at) + 25 * 60 * 60 * 1000).toISOString();
      setSimulatedNow(simulatedAt);
    }

    const state = await buildFullWorkflowState(phone);

    return simulatorMeta({
      mode,
      workflow: state.workflow,
      stall: state.workflow?.stall || null
    });
  });
}

async function simulateInterview(payload = {}) {
  return withSimulatorGuard(async () => {
    const phone = payload.phone;
    assertSimulatorPhone(phone);
    const action = payload.action || "schedule";

    if (action === "schedule") {
      return advanceSimulatorWorkflow(phone, {
        targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
        capturedFields: {
          city: payload.city || "Miami",
          state: payload.state || "FL",
          authorization: true,
          occupation: payload.occupation || "Sales",
          interviewType: payload.interviewType || "Zoom",
          email: payload.email || "sim@example.com",
          interviewDateTime:
            payload.interviewDateTime ||
            new Date(Date.now() + 86400000).toISOString(),
          confirmed: payload.confirmed !== false
        },
        interactionType: "phone",
        interactionNotes: "Simulator interview schedule"
      });
    }

    if (action === "fast_forward") {
      const prospect = await findProspect(phone);
      const interviewAt =
        payload.interviewDateTime ||
        prospect?.interview_time ||
        prospect?.appointment_date;

      if (!interviewAt) {
        const error = new Error("No interview time to fast-forward.");
        error.code = "NO_INTERVIEW_TIME";
        throw error;
      }

      setSimulatedNow(new Date(Date.parse(interviewAt) + 3600000).toISOString());
      const state = await buildFullWorkflowState(phone);

      return simulatorMeta({
        action,
        workflow: state.workflow
      });
    }

    if (action === "record_outcome") {
      const target =
        payload.targetMilestone ||
        (payload.outcome === "Recruited"
          ? MILESTONES.ORIENTATION
          : payload.outcome === "Not Interested"
            ? MILESTONES.CLOSED
            : MILESTONES.FOLLOW_UP);

      return advanceSimulatorWorkflow(phone, {
        targetMilestone: target,
        capturedFields: {
          outcome: payload.outcome || "No Show",
          followUpDate: payload.followUpDate,
          followUpTime: payload.followUpTime,
          closureReason: payload.closureReason
        },
        interactionNotes: `Simulator outcome: ${payload.outcome || "No Show"}`,
        interactionType: "phone"
      });
    }

    const error = new Error(`Unknown interview action: ${action}`);
    error.code = "UNKNOWN_ACTION";
    throw error;
  });
}

async function getSimulatorState(phone) {
  assertSimulatorPhone(phone);
  const state = await buildFullWorkflowState(phone);

  if (!state) {
    return null;
  }

  return simulatorMeta(state);
}

async function getSimulatorEvents(phone, query = {}) {
  assertSimulatorPhone(phone);
  const limit = Number(query.limit) || 50;
  const events = await listWorkflowEvents(phone, limit);

  let filtered = events;

  if (query.since) {
    const sinceMs = Date.parse(query.since);
    filtered = events.filter((row) => Date.parse(row.created_at) >= sinceMs);
  }

  return simulatorMeta({ phone, events: filtered });
}

async function getSimulatorTimeline(phone) {
  assertSimulatorPhone(phone);
  const [messages, events] = await Promise.all([
    getConversationTimeline(phone),
    listWorkflowEvents(phone, 100)
  ]);

  const merged = [
    ...messages.map((row) => ({
      timestamp: row.created_at,
      kind: "message",
      direction: row.direction,
      summary: row.message,
      eventType: null
    })),
    ...events.map((row) => ({
      timestamp: row.created_at,
      kind: "workflow_event",
      direction: null,
      summary: row.event_type,
      eventType: row.event_type,
      ownershipAfter: row.ownership_after,
      payload: row.payload
    }))
  ].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

  return simulatorMeta({ phone, timeline: merged });
}

async function reactivateSimulatorProspect(phone, body = {}) {
  return withSimulatorGuard(async () => {
    assertSimulatorPhone(phone);

    savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.QUALIFICATION,
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: false,
      doNotContact: false,
      manualAgentOwnership: true,
      stalledAt: null,
      stallEpisodeKey: null
    });

    mergeAgentState(phone, {
      outcome: null,
      closureReason: null
    });

    return advanceSimulatorWorkflow(phone, body);
  });
}

async function getSimulatorPriority() {
  const { data, error } = await supabase.from("prospects").select("*");

  if (error) {
    throw error;
  }

  const simProspects = (data || []).filter((row) => isSimulatorPhone(row.phone));
  const queue = await buildPrioritizedWorkflowQueue(simProspects);

  return simulatorMeta({ queue });
}

function handleSimulatorError(error) {
  return {
    success: false,
    simulator: true,
    error: error.code || "SIMULATOR_ERROR",
    message: error.message
  };
}

module.exports = {
  createSimulatorProspect,
  simulateMessage,
  advanceSimulatorWorkflow,
  simulateStall,
  simulateInterview,
  getSimulatorState,
  getSimulatorEvents,
  getSimulatorTimeline,
  reactivateSimulatorProspect,
  getSimulatorPriority,
  cleanupSimulatorProspect,
  buildFullWorkflowState,
  createScenarioRecorder,
  handleSimulatorError,
  simulatorMeta,
  isSimulatorPhone
};
