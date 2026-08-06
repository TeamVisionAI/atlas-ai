/**
 * Prospect Workspace sticky identity summary — presentation only.
 * Uses prospect ID as identity; never treats phone as canonical identity.
 */

import { formatAtlasDateTime } from "../utils/dateFormatter.js";
import {
  formatInterviewMeetingTypeLabel,
  formatInterviewStatusLabel
} from "./interviewModulePresentation.js";
import {
  resolveInterviewWorkflowStateLabelKey,
  resolveInterviewWorkflowUiStateFromInterview
} from "./interviewWorkflowPresentationEngine.js";

function formatStickyAppointmentWhen(isoString) {
  if (!isoString) {
    return null;
  }

  const parsed = Date.parse(isoString);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return formatAtlasDateTime(new Date(parsed));
}

/**
 * Mask contact for display — last 4 digits only. Never returns raw E.164.
 * @param {unknown} phone
 * @returns {string|null}
 */
export function maskProspectContact(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length < 4) {
    return null;
  }

  return `+*******${digits.slice(-4)}`;
}

function looksLikeRawPhone(value) {
  const text = String(value || "");
  return /\+?\d[\d\s().-]{7,}\d/.test(text) || E164_LIKE.test(text);
}

const E164_LIKE = /^\+?\d{10,15}$/;
const SNAKE_CASE = /^[a-z0-9]+(_[a-z0-9]+)+$/;

/**
 * Build sticky identity view-model from workspace read model + core id.
 */
export function buildProspectStickyIdentitySummary({
  prospectId = null,
  identity = {},
  status = {},
  owner = null,
  prospectCore = null,
  interview = null,
  translate = (key) => key
} = {}) {
  const name = identity?.name && identity.name !== "—" ? identity.name : translate("workspaceStickyUnknownName");

  const stage =
    status?.milestone ||
    translate("workspaceStatusSummaryUnknown");

  const ownerLabel =
    prospectCore?.assignedAgent?.displayName ||
    prospectCore?.assignedAgent?.assignedAgentName ||
    owner?.display_name ||
    translate("workspaceHeaderUnassigned");

  const language =
    identity?.communicationLanguage ||
    translate("workspaceHeaderUnknown");

  const appointmentStatusRaw =
    interview?.appointmentStatus || interview?.lifecycleState || null;
  const workflowState = interview
    ? resolveInterviewWorkflowUiStateFromInterview(interview)
    : "none";

  let appointmentStatusLabel = "—";

  if (interview && workflowState !== "none") {
    const stateKey = resolveInterviewWorkflowStateLabelKey(workflowState);
    const translatedState = translate(stateKey);
    appointmentStatusLabel =
      translatedState && translatedState !== stateKey
        ? translatedState
        : formatInterviewStatusLabel(appointmentStatusRaw || workflowState);
  } else if (appointmentStatusRaw) {
    appointmentStatusLabel = formatInterviewStatusLabel(appointmentStatusRaw);
  }

  const appointmentWhen = interview?.datetime
    ? formatStickyAppointmentWhen(interview.datetime)
    : null;

  const appointmentTypeLabel = interview?.type
    ? formatInterviewMeetingTypeLabel(interview.type)
    : null;

  const maskedContact = maskProspectContact(identity?.phone);
  const outcomeNeeded = Boolean(interview?.gateActive);
  const humanAssist = Boolean(
    interview?.humanAssistRequired || status?.humanAssistRequired
  );

  const summary = {
    prospectId: prospectId || null,
    name,
    stage,
    ownerLabel,
    language,
    appointmentStatusLabel,
    appointmentWhen,
    appointmentTypeLabel,
    maskedContact,
    outcomeNeeded,
    humanAssist,
    hasScheduledInterview: Boolean(interview?.datetime || interview?.appointmentId)
  };

  assertSafeStickySummary(summary, identity?.phone);

  return summary;
}

/**
 * Guardrails for tests / diagnostics — never expose raw phone or snake_case enums.
 */
export function assertSafeStickySummary(summary, rawPhone = null) {
  const blob = JSON.stringify(summary);

  if (rawPhone && String(rawPhone).length > 4 && blob.includes(String(rawPhone))) {
    throw new Error("Sticky identity summary must not include raw phone");
  }

  if (looksLikeRawPhone(summary.maskedContact)) {
    const digits = String(summary.maskedContact || "").replace(/\D/g, "");
    if (digits.length >= 10) {
      throw new Error("Sticky identity masked contact looks unmasked");
    }
  }

  for (const value of [
    summary.appointmentStatusLabel,
    summary.appointmentTypeLabel,
    summary.stage
  ]) {
    if (value && SNAKE_CASE.test(String(value))) {
      throw new Error(`Sticky identity leaked snake_case value: ${value}`);
    }
  }

  return true;
}

export function stickySummaryContainsOperationalActions(source = "") {
  return /appointmentsRescheduleInterview|appointmentsCancelInterview|appointmentsCompleteInterview|send_zoom_link|send_interview_reminder|send_office_location|CUSTOM_WHATSAPP|executeCommunicationAction/.test(
    source
  );
}
