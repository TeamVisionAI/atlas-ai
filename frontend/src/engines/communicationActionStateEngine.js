/**
 * Communication action availability — pure resolution for panel visibility.
 * Implements BR-027; Sprint 12.2.y — section always visible, actions individually gated.
 */

import { resolvePersistedAppointmentId } from "./appointmentIdEngine.js";

export const COMMUNICATION_ACTION_IDS = Object.freeze({
  SEND_ZOOM: "send_zoom_link",
  SEND_OFFICE: "send_office_location",
  SEND_REMINDER: "send_interview_reminder",
  RESEND_INTERVIEW_DETAILS: "resend_interview_details",
  CUSTOM: "whatsapp"
});

/** Appointment-based communications — shared eligibility (BR-027). */
export const APPOINTMENT_COMMUNICATION_ACTION_IDS = new Set([
  COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
  COMMUNICATION_ACTION_IDS.SEND_ZOOM,
  COMMUNICATION_ACTION_IDS.SEND_OFFICE,
  COMMUNICATION_ACTION_IDS.SEND_REMINDER
]);

export const PANEL_COMMUNICATION_ACTION_IDS = new Set(Object.values(COMMUNICATION_ACTION_IDS));

/**
 * Static representative workflow order for the Communication panel (Sprint 12.3.3).
 * Future: Workflow Engine supplies a prioritized list without changing panel layout.
 */
export const COMMUNICATION_PANEL_ACTION_ORDER = Object.freeze([
  COMMUNICATION_ACTION_IDS.CUSTOM,
  COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
  COMMUNICATION_ACTION_IDS.SEND_OFFICE,
  COMMUNICATION_ACTION_IDS.SEND_ZOOM,
  COMMUNICATION_ACTION_IDS.SEND_REMINDER
]);

export function orderCommunicationPanelActions(
  actions,
  order = COMMUNICATION_PANEL_ACTION_ORDER
) {
  const rank = new Map(order.map((id, index) => [id, index]));

  return [...actions].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
}

const SOON_MS = 2 * 60 * 60 * 1000;

const DISABLED_REASON_KEYS = Object.freeze({
  WORKFLOW_GATE: "whatsappActionDisabledWorkflowGate",
  INTERVIEW_NOT_CONFIRMED: "whatsappActionDisabledInterviewNotConfirmed",
  APPOINTMENT_NOT_LINKED: "whatsappActionDisabledAppointmentNotLinked",
  EMAIL_MISSING: "whatsappActionDisabledEmailMissing",
  ZOOM_NOT_CREATED: "whatsappActionDisabledZoomNotCreated",
  OFFICE_NOT_CONFIGURED: "whatsappActionDisabledOfficeNotConfigured",
  INTERVIEW_TYPE_ZOOM: "whatsappActionDisabledInterviewTypeZoom",
  INTERVIEW_TYPE_OFFICE: "whatsappActionDisabledInterviewTypeOffice",
  WORKSPACE_UNAVAILABLE: "whatsappActionDisabledWorkspaceUnavailable"
});

function normalizeInterviewType(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    return "zoom";
  }

  if (
    normalized.includes("office") ||
    normalized.includes("person") ||
    normalized.includes("public") ||
    normalized.includes("in person") ||
    normalized.includes("in_person")
  ) {
    return "office";
  }

  return null;
}

function parseInterviewDatetimeMs(workspace) {
  const candidates = [
    workspace?.interview?.datetime,
    workspace?.conversation?.interviewTime,
    workspace?.conversation?.appointmentDate,
    workspace?.raw?.prospect?.interview_datetime
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }

    const parsed = Date.parse(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getInterviewTimingPhase(interviewAtMs) {
  if (interviewAtMs === null) {
    return "none";
  }

  const delta = interviewAtMs - Date.now();

  if (delta < 0) {
    return "past";
  }

  if (delta <= SOON_MS) {
    return "soon";
  }

  return "future";
}

export function isInterviewConfirmed(workspace) {
  const step = workspace?.brain?.currentStep || workspace?.raw?.brain?.currentStep;

  if (step === "CONFIRMED") {
    return true;
  }

  if (workspace?.raw?.prospect?.calendar_event_id) {
    return true;
  }

  if (workspace?.interview?.calendarEventId) {
    return true;
  }

  const milestone = workspace?.prospect?.milestone || workspace?.status?.milestone;

  return milestone === "Interview Confirmed";
}

function isWorkflowGateActive(workspace) {
  return Boolean(workspace?.workflowGate?.active);
}

function getAgentFlags(workspace) {
  return workspace?.raw?.agentState?.flags || workspace?.agentState?.flags || {};
}

function resolveProspectEmail(workspace) {
  return (
    workspace?.prospect?.email ||
    workspace?.raw?.prospect?.email ||
    workspace?.raw?.editorProfile?.email ||
    null
  );
}

function isZoomMeetingAvailable(workspace, organizationSettings = null) {
  if (organizationSettings?.meetingManagement?.personalMeetingUrl) {
    return true;
  }

  return Boolean(
    workspace?.interview?.calendarEventId ||
      workspace?.raw?.prospect?.calendar_event_id
  );
}

function isOfficeLocationAvailable(organizationSettings = null) {
  const office = organizationSettings?.office;

  return Boolean(office?.fullAddress || office?.mapsUrl || office?.name);
}

export function buildCommunicationActionContext(workspace, organizationSettings = null) {
  const interviewAtMs = parseInterviewDatetimeMs(workspace);
  const confirmed = isInterviewConfirmed(workspace);

  return {
    workflowGateActive: isWorkflowGateActive(workspace),
    confirmed,
    appointmentId: resolvePersistedAppointmentId(workspace?.interview?.appointmentId),
    interviewType: normalizeInterviewType(
      workspace?.prospect?.interviewType ||
        workspace?.interview?.type ||
        workspace?.brain?.interviewType
    ),
    interviewAtMs,
    timing: getInterviewTimingPhase(interviewAtMs),
    flags: getAgentFlags(workspace),
    hasZoomMeeting: isZoomMeetingAvailable(workspace, organizationSettings),
    hasOfficeLocation: isOfficeLocationAvailable(organizationSettings),
    hasProspectEmail: Boolean(resolveProspectEmail(workspace))
  };
}

/**
 * Canonical eligibility for all persisted appointment communications.
 * Requires: confirmed interview, persisted atlas_appointments.id, scheduled datetime,
 * then channel-specific resources (zoom link or office address).
 */
export function evaluateAppointmentCommunicationAvailability(ctx, options = {}) {
  if (!ctx.confirmed) {
    return DISABLED_REASON_KEYS.INTERVIEW_NOT_CONFIRMED;
  }

  if (!ctx.appointmentId) {
    return DISABLED_REASON_KEYS.APPOINTMENT_NOT_LINKED;
  }

  if (ctx.interviewAtMs === null) {
    return DISABLED_REASON_KEYS.INTERVIEW_NOT_CONFIRMED;
  }

  const interviewType = options.interviewType || ctx.interviewType;

  if (options.requireZoomInterview) {
    if (interviewType !== "zoom") {
      return DISABLED_REASON_KEYS.INTERVIEW_TYPE_ZOOM;
    }

    if (!ctx.hasZoomMeeting) {
      return DISABLED_REASON_KEYS.ZOOM_NOT_CREATED;
    }

    return null;
  }

  if (options.requireOfficeInterview) {
    if (interviewType !== "office") {
      return DISABLED_REASON_KEYS.INTERVIEW_TYPE_OFFICE;
    }

    if (!ctx.hasOfficeLocation) {
      return DISABLED_REASON_KEYS.OFFICE_NOT_CONFIGURED;
    }

    return null;
  }

  if (interviewType === "zoom" && !ctx.hasZoomMeeting) {
    return DISABLED_REASON_KEYS.ZOOM_NOT_CREATED;
  }

  if (interviewType === "office" && !ctx.hasOfficeLocation) {
    return DISABLED_REASON_KEYS.OFFICE_NOT_CONFIGURED;
  }

  return null;
}

function enabledAction(partial, ctx, translate) {
  return {
    ...partial,
    enabled: true,
    disabledReasonKey: null,
    title: translate ? translate(partial.titleKey) : partial.titleKey,
    subtitle: translate ? translate(partial.subtitleKey) : partial.subtitleKey
  };
}

function disabledAction(partial, disabledReasonKey, ctx, translate) {
  return {
    ...partial,
    enabled: false,
    disabledReasonKey,
    title: translate ? translate(partial.titleKey) : partial.titleKey,
    subtitle: translate ? translate(disabledReasonKey) : disabledReasonKey
  };
}

function gateOrEnabled(partial, ctx, translate, evaluateEnabled) {
  if (!ctx.workspacePresent) {
    return disabledAction(partial, DISABLED_REASON_KEYS.WORKSPACE_UNAVAILABLE, ctx, translate);
  }

  if (ctx.workflowGateActive) {
    return disabledAction(partial, DISABLED_REASON_KEYS.WORKFLOW_GATE, ctx, translate);
  }

  const disabledReasonKey = evaluateEnabled(ctx);

  if (disabledReasonKey) {
    return disabledAction(partial, disabledReasonKey, ctx, translate);
  }

  return enabledAction(partial, ctx, translate);
}

function evaluateResendInterviewDetails(ctx) {
  return evaluateAppointmentCommunicationAvailability(ctx);
}

function evaluateSendZoom(ctx) {
  return evaluateAppointmentCommunicationAvailability(ctx, { requireZoomInterview: true });
}

function evaluateSendOffice(ctx) {
  return evaluateAppointmentCommunicationAvailability(ctx, { requireOfficeInterview: true });
}

function evaluateSendReminder(ctx) {
  return evaluateAppointmentCommunicationAvailability(ctx);
}

/**
 * Resolves the full communication panel catalog with per-action availability.
 *
 * @param {import("../types/missionControl").AgentWorkspaceModel | null | undefined} workspace
 * @param {{ translate?: Function, organizationSettings?: import("../types/organization").OrganizationSettings | null }} [options]
 */
export function resolveCommunicationActions(workspace, { translate, organizationSettings = null, actionOrder } = {}) {
  const ctx = {
    workspacePresent: Boolean(workspace),
    ...buildCommunicationActionContext(workspace || {}, organizationSettings)
  };

  const resendTitleKey = "whatsappActionResendInterviewDetails";
  const zoomTitleKey = ctx.flags?.zoom_link_sent
    ? "whatsappActionResendZoom"
    : "whatsappActionSendZoom";

  const catalog = [
    {
      id: COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS,
      icon: "📤",
      titleKey: resendTitleKey,
      subtitleKey: "whatsappActionOneClickHint",
      variant: "primary",
      evaluate: evaluateResendInterviewDetails
    },
    {
      id: COMMUNICATION_ACTION_IDS.SEND_ZOOM,
      icon: "🎥",
      titleKey: zoomTitleKey,
      subtitleKey: "whatsappActionOneClickHint",
      variant: "primary",
      evaluate: evaluateSendZoom
    },
    {
      id: COMMUNICATION_ACTION_IDS.SEND_OFFICE,
      icon: "📍",
      titleKey: "whatsappActionSendOffice",
      subtitleKey: "whatsappActionOneClickHint",
      variant: "primary",
      evaluate: evaluateSendOffice
    },
    {
      id: COMMUNICATION_ACTION_IDS.SEND_REMINDER,
      icon: "⏰",
      titleKey: "whatsappActionSendReminder",
      subtitleKey: "whatsappActionOneClickHint",
      variant: ctx.timing === "soon" ? "accent" : "default",
      evaluate: evaluateSendReminder
    },
    {
      id: COMMUNICATION_ACTION_IDS.CUSTOM,
      icon: "💬",
      titleKey: "whatsappActionCustomMessage",
      subtitleKey: "whatsappActionOneClickHint",
      variant: "default",
      evaluate: () => null
    }
  ];

  return orderCommunicationPanelActions(
    catalog.map((entry) =>
      gateOrEnabled(
        {
          id: entry.id,
          icon: entry.icon,
          titleKey: entry.titleKey,
          subtitleKey: entry.subtitleKey,
          variant: entry.variant
        },
        ctx,
        translate,
        entry.evaluate
      )
    ),
    actionOrder
  );
}

export function isPanelCommunicationAction(actionId) {
  return PANEL_COMMUNICATION_ACTION_IDS.has(actionId);
}

export function filterPanelCommunicationActions(actions) {
  return (actions || []).filter((action) => !isPanelCommunicationAction(action.id));
}

export function buildCommunicationActionCard(action, { onClick, busy = false }) {
  const disabled = busy || !action.enabled;

  return {
    id: action.id,
    icon: action.icon,
    title: action.title,
    subtitle: action.subtitle || "",
    variant: action.variant || "default",
    onClick: disabled ? undefined : onClick,
    disabled,
    disabledReasonKey: action.disabledReasonKey || null
  };
}
