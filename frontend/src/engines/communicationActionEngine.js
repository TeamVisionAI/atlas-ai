/**
 * Reusable WhatsApp communication action engine.
 * Each action defines title, icon, visibility, and execution via one-click copy+open.
 * Implements BR-027 (type-specific sends); resend UX supersedes BR-029 hide-after-send for Zoom.
 */

import { executeSendViaWhatsApp } from "../services/whatsappCommunicationService";
import { executeZoomInvitationAction } from "../services/communicationActionService";

export const COMMUNICATION_ACTION_IDS = Object.freeze({
  SEND_ZOOM: "send_zoom_link",
  SEND_OFFICE: "send_office_location",
  SEND_REMINDER: "send_interview_reminder",
  CUSTOM: "whatsapp"
});

/** Actions rendered in the communication panel — excluded from Next Actions and mission lists. */
export const PANEL_COMMUNICATION_ACTION_IDS = new Set(Object.values(COMMUNICATION_ACTION_IDS));

const SOON_MS = 2 * 60 * 60 * 1000;
const APPROACHING_MS = 24 * 60 * 60 * 1000;

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
    normalized.includes("in person")
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

function isInterviewApproaching(interviewAtMs) {
  const timing = getInterviewTimingPhase(interviewAtMs);

  if (timing === "soon") {
    return true;
  }

  if (timing === "future" && interviewAtMs - Date.now() <= APPROACHING_MS) {
    return true;
  }

  return false;
}

function isInterviewConfirmed(workspace) {
  const step = workspace?.brain?.currentStep || workspace?.raw?.brain?.currentStep;

  if (step === "CONFIRMED") {
    return true;
  }

  if (workspace?.raw?.prospect?.calendar_event_id) {
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

/**
 * Resolves context-aware WhatsApp communication actions for the active prospect.
 *
 * @param {import("../types/missionControl").AgentWorkspaceModel} workspace
 * @param {{ translate?: Function }} [options]
 */
export function resolveCommunicationActions(workspace, { translate } = {}) {
  if (!workspace || isWorkflowGateActive(workspace)) {
    return [];
  }

  const flags = getAgentFlags(workspace);
  const interviewType = normalizeInterviewType(
    workspace?.prospect?.interviewType ||
      workspace?.interview?.type ||
      workspace?.brain?.interviewType
  );
  const confirmed = isInterviewConfirmed(workspace);
  const interviewAtMs = parseInterviewDatetimeMs(workspace);
  const timing = getInterviewTimingPhase(interviewAtMs);
  const approaching = confirmed && interviewAtMs !== null && isInterviewApproaching(interviewAtMs);

  const actions = [];

  if (confirmed && interviewType === "zoom") {
    actions.push({
      id: COMMUNICATION_ACTION_IDS.SEND_ZOOM,
      icon: "💬",
      titleKey: flags.zoom_link_sent ? "whatsappActionResendZoom" : "whatsappActionSendZoom",
      subtitleKey: "whatsappActionOneClickHint",
      variant: "primary"
    });
  }

  if (confirmed && interviewType === "office") {
    actions.push({
      id: COMMUNICATION_ACTION_IDS.SEND_OFFICE,
      icon: "📍",
      titleKey: "whatsappActionSendOffice",
      subtitleKey: "whatsappActionOneClickHint",
      variant: "primary"
    });
  }

  if (approaching) {
    actions.push({
      id: COMMUNICATION_ACTION_IDS.SEND_REMINDER,
      icon: "⏰",
      titleKey: "whatsappActionSendReminder",
      subtitleKey: "whatsappActionOneClickHint",
      variant: timing === "soon" ? "accent" : "default"
    });
  }

  actions.push({
    id: COMMUNICATION_ACTION_IDS.CUSTOM,
    icon: "💬",
    titleKey: "whatsappActionCustomMessage",
    subtitleKey: "whatsappActionOneClickHint",
    variant: "default"
  });

  return actions.map((action) => ({
    ...action,
    title: translate ? translate(action.titleKey) : action.titleKey,
    subtitle: action.subtitleKey && translate ? translate(action.subtitleKey) : ""
  }));
}

export function isPanelCommunicationAction(actionId) {
  return PANEL_COMMUNICATION_ACTION_IDS.has(actionId);
}

export function filterPanelCommunicationActions(actions) {
  return (actions || []).filter((action) => !isPanelCommunicationAction(action.id));
}

export function buildCommunicationActionCard(action, { onClick, disabled = false }) {
  return {
    id: action.id,
    icon: action.icon,
    title: action.title,
    subtitle: action.subtitle || "",
    variant: action.variant || "default",
    onClick,
    disabled
  };
}

/** One-click execution: channel-aware for Zoom; WhatsApp copy+open for other actions. */
export function executeCommunicationAction(options) {
  if (options.actionId === COMMUNICATION_ACTION_IDS.SEND_ZOOM) {
    return executeZoomInvitationAction({
      phone: options.phone,
      translate: options.translate,
      showSuccess: options.showSuccess,
      showError: options.showError,
      showInfo: options.showInfo,
      onOrganizationResourceMissing: options.onOrganizationResourceMissing,
      onRecorded: options.onRecorded,
      forceWhatsApp: options.forceWhatsApp,
      onWhatsAppFallbackOffer: options.onWhatsAppFallbackOffer
    });
  }

  return executeSendViaWhatsApp(options);
}
