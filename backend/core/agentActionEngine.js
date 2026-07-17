const { parseInterviewDatetime } = require("./parseInterviewDatetime");

const MILESTONES = {
  NEW_LEAD: "New Lead",
  QUALIFYING: "Qualifying",
  INTERVIEW_SCHEDULED: "Interview Scheduled",
  INTERVIEW_CONFIRMED: "Interview Confirmed",
  RECRUITED: "Recruited",
  ORIENTATION_SCHEDULED: "Orientation Scheduled",
  ONBOARDING: "Onboarding",
  FOLLOW_UP: "Follow Up",
  CLOSED: "Closed"
};

const ACTION_IDS = {
  CALL: "call",
  WHATSAPP: "whatsapp",
  SEND_ZOOM_LINK: "send_zoom_link",
  SEND_OFFICE_LOCATION: "send_office_location",
  SCHEDULE: "schedule",
  RESCHEDULE: "reschedule",
  NOTES: "notes",
  SEND_MISSED_APPOINTMENT: "send_missed_appointment",
  LOG_WHATSAPP_OPEN: "log_whatsapp_open"
};

const MAX_VISIBLE_ACTIONS = 5;
const SOON_MS = 2 * 60 * 60 * 1000;

function normalizeInterviewType(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    return "Zoom";
  }

  if (
    normalized.includes("office") ||
    normalized.includes("person") ||
    normalized.includes("in person")
  ) {
    return "Office";
  }

  return value;
}

function deriveMilestoneLabel(currentStep, missingFields, agentState) {
  if (agentState.outcome === "Recruited") {
    return agentState.orientationScheduled
      ? MILESTONES.ORIENTATION_SCHEDULED
      : MILESTONES.RECRUITED;
  }

  if (agentState.outcome === "Needs More Time" || agentState.outcome === "No Show") {
    return MILESTONES.FOLLOW_UP;
  }

  if (agentState.outcome === "Not Interested") {
    return MILESTONES.CLOSED;
  }

  if (currentStep === "CONFIRMED") {
    return MILESTONES.INTERVIEW_CONFIRMED;
  }

  if (missingFields.includes("schedule") || currentStep === "SCHEDULE") {
    return MILESTONES.INTERVIEW_SCHEDULED;
  }

  if (missingFields.length) {
    return MILESTONES.QUALIFYING;
  }

  return MILESTONES.NEW_LEAD;
}

function getInterviewTimingPhase(prospect) {
  const parsed = parseInterviewDatetime(prospect);

  if (parsed === null) {
    return "none";
  }

  const delta = parsed - Date.now();

  if (delta < 0) {
    return "past";
  }

  if (delta <= SOON_MS) {
    return "soon";
  }

  return "future";
}

function isWorkflowGateActive(prospect, agentState) {
  if (agentState.outcome) {
    return false;
  }

  if (prospect?.current_step !== "CONFIRMED") {
    return false;
  }

  return getInterviewTimingPhase(prospect) === "past";
}

function isSchedulingReady(missingFields, currentStep) {
  return missingFields.includes("schedule") || currentStep === "SCHEDULE";
}

function isFollowUpDue(agentState) {
  if (agentState.outcome !== "Needs More Time" && agentState.outcome !== "No Show") {
    return false;
  }

  if (!agentState.followUpDate) {
    return true;
  }

  const followUpAt = Date.parse(
    `${agentState.followUpDate}T${agentState.followUpTime || "00:00"}`
  );

  if (Number.isNaN(followUpAt)) {
    return true;
  }

  return followUpAt <= Date.now();
}

function pushAction(actions, id, priority) {
  if (!actions.some((action) => action.id === id)) {
    actions.push({ id, priority });
  }
}

function enforceSinglePrimary(actions) {
  let seenPrimary = false;

  return actions.map((action) => {
    if (action.priority !== "primary") {
      return action;
    }

    if (seenPrimary) {
      return { ...action, priority: "secondary" };
    }

    seenPrimary = true;
    return action;
  });
}

function isConfirmedProspect(prospect, currentStep) {
  return currentStep === "CONFIRMED" || Boolean(prospect?.calendar_event_id);
}

function applyCommunicationPriority(actions, { milestone, timing, agentState }) {
  const hasCall = actions.some((action) => action.id === ACTION_IDS.CALL);
  const hasWhatsApp = actions.some((action) => action.id === ACTION_IDS.WHATSAPP);

  if (!hasCall || !hasWhatsApp) {
    return actions;
  }

  let primaryComm = ACTION_IDS.WHATSAPP;

  if (timing === "soon") {
    primaryComm = ACTION_IDS.CALL;
  }

  if (milestone === MILESTONES.FOLLOW_UP && isFollowUpDue(agentState)) {
    primaryComm = ACTION_IDS.CALL;
  }

  if (agentState.outcome === "No Show") {
    primaryComm = ACTION_IDS.CALL;
  }

  if (milestone === MILESTONES.NEW_LEAD || milestone === MILESTONES.QUALIFYING) {
    primaryComm = ACTION_IDS.WHATSAPP;
  }

  const hasNonCommunicationPrimary = actions.some(
    (action) =>
      action.priority === "primary" &&
      action.id !== ACTION_IDS.CALL &&
      action.id !== ACTION_IDS.WHATSAPP
  );

  if (hasNonCommunicationPrimary) {
    return actions.map((action) => {
      if (action.id === ACTION_IDS.CALL || action.id === ACTION_IDS.WHATSAPP) {
        return { ...action, priority: "secondary" };
      }

      return action;
    });
  }

  return actions.map((action) => {
    if (action.id === primaryComm) {
      return { ...action, priority: "primary" };
    }

    if (action.id === ACTION_IDS.CALL || action.id === ACTION_IDS.WHATSAPP) {
      return { ...action, priority: "secondary" };
    }

    return action;
  });
}

/**
 * Implements BR-025 through BR-032.
 */
function resolveAvailableActions({
  prospect,
  currentStep,
  missingFields,
  interviewType,
  agentState,
  organizationSettings
}) {
  if (!prospect) {
    return [];
  }

  if (isWorkflowGateActive(prospect, agentState)) {
    return [];
  }

  const milestone = deriveMilestoneLabel(currentStep, missingFields, agentState);
  const timing = getInterviewTimingPhase(prospect);
  const normalizedType = normalizeInterviewType(interviewType);
  const flags = agentState.flags || {};
  const actions = [];

  if (milestone === MILESTONES.CLOSED) {
    pushAction(actions, ACTION_IDS.NOTES, "primary");

    if (agentState.futureReminder) {
      pushAction(actions, ACTION_IDS.WHATSAPP, "secondary");
    }

    return actions.slice(0, MAX_VISIBLE_ACTIONS);
  }

  if (
    agentState.outcome === "Recruited" ||
    milestone === MILESTONES.ORIENTATION_SCHEDULED ||
    milestone === MILESTONES.ONBOARDING
  ) {
    pushAction(actions, ACTION_IDS.NOTES, "primary");
    pushAction(actions, ACTION_IDS.CALL, "secondary");
    pushAction(actions, ACTION_IDS.WHATSAPP, "secondary");
    return actions.slice(0, MAX_VISIBLE_ACTIONS);
  }

  if (agentState.outcome === "No Show") {
    pushAction(actions, ACTION_IDS.SEND_MISSED_APPOINTMENT, "primary");

    if (!flags.missed_appointment_sent) {
      /* keep primary */
    }

    pushAction(actions, ACTION_IDS.RESCHEDULE, "secondary");
    pushAction(actions, ACTION_IDS.CALL, "secondary");
    pushAction(actions, ACTION_IDS.WHATSAPP, "secondary");
    pushAction(actions, ACTION_IDS.NOTES, "secondary");

    return enforceSinglePrimary(
      applyCommunicationPriority(actions, { milestone, timing, agentState })
    ).slice(0, MAX_VISIBLE_ACTIONS);
  }

  if (agentState.outcome === "Needs More Time" || milestone === MILESTONES.FOLLOW_UP) {
    pushAction(
      actions,
      isFollowUpDue(agentState) ? ACTION_IDS.CALL : ACTION_IDS.WHATSAPP,
      "primary"
    );
    pushAction(actions, ACTION_IDS.CALL, "secondary");
    pushAction(actions, ACTION_IDS.WHATSAPP, "secondary");
    pushAction(actions, ACTION_IDS.RESCHEDULE, "secondary");
    pushAction(actions, ACTION_IDS.NOTES, "secondary");

    return enforceSinglePrimary(
      applyCommunicationPriority(actions, { milestone, timing, agentState })
    ).slice(0, MAX_VISIBLE_ACTIONS);
  }

  pushAction(actions, ACTION_IDS.CALL, "secondary");
  pushAction(actions, ACTION_IDS.WHATSAPP, "secondary");
  pushAction(actions, ACTION_IDS.NOTES, "secondary");

  if (milestone === MILESTONES.NEW_LEAD) {
    return enforceSinglePrimary(
      applyCommunicationPriority(actions, {
        milestone,
        timing,
        agentState
      })
    ).slice(0, MAX_VISIBLE_ACTIONS);
  }

  const scheduleReady = isSchedulingReady(missingFields, currentStep);
  const confirmed = isConfirmedProspect(prospect, currentStep);

  if (scheduleReady && !confirmed) {
    pushAction(actions, ACTION_IDS.SCHEDULE, "primary");
  }

  if (milestone === MILESTONES.INTERVIEW_CONFIRMED) {
    if (timing === "soon" && normalizedType === "Zoom" && !flags.zoom_link_sent) {
      pushAction(actions, ACTION_IDS.SEND_ZOOM_LINK, "primary");
    } else if (timing === "soon" && normalizedType === "Office" && !flags.office_location_sent) {
      pushAction(actions, ACTION_IDS.SEND_OFFICE_LOCATION, "primary");
    } else {
      pushAction(actions, ACTION_IDS.RESCHEDULE, timing === "soon" ? "primary" : "secondary");
    }

    if (timing !== "soon") {
      if (normalizedType === "Zoom" && !flags.zoom_link_sent && organizationSettings?.zoomInterviewUrl) {
        pushAction(actions, ACTION_IDS.SEND_ZOOM_LINK, "secondary");
      }

      if (normalizedType === "Office" && !flags.office_location_sent) {
        pushAction(actions, ACTION_IDS.SEND_OFFICE_LOCATION, "secondary");
      }

      pushAction(actions, ACTION_IDS.RESCHEDULE, "secondary");
    } else {
      pushAction(actions, ACTION_IDS.RESCHEDULE, "secondary");
    }
  }

  const prioritized = enforceSinglePrimary(
    applyCommunicationPriority(actions, {
      milestone,
      timing,
      agentState
    })
  );

  const primary = prioritized.filter((action) => action.priority === "primary");
  const secondary = prioritized.filter((action) => action.priority !== "primary");

  return [...primary, ...secondary].slice(0, MAX_VISIBLE_ACTIONS);
}

module.exports = {
  ACTION_IDS,
  MILESTONES,
  resolveAvailableActions,
  deriveMilestoneLabel,
  getInterviewTimingPhase,
  isWorkflowGateActive,
  normalizeInterviewType
};
