/**
 * Appointment card presentation — pure UI rules for Appointments page (BR-043).
 * No backend or lifecycle behavior; visibility and labels only.
 */

const TERMINAL_APPOINTMENT_STATUSES = new Set(["cancelled", "completed"]);

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isTerminalAppointmentStatus(appointment = {}) {
  const status = normalizeToken(appointment.status);
  const lifecycle = normalizeToken(appointment.metadata?.lifecycleState);

  return (
    TERMINAL_APPOINTMENT_STATUSES.has(status) ||
    lifecycle === "cancelled" ||
    lifecycle === "completed" ||
    lifecycle === "recruited" ||
    lifecycle === "became_client" ||
    lifecycle === "no_show"
  );
}

/** Case-insensitive Zoom interview detection (provider enum / label variants). */
export function isZoomMeetingAppointment(appointment = {}) {
  const meetingType = normalizeToken(appointment.meetingType || appointment.meeting_type);
  const provider = normalizeToken(appointment.meetingProvider || appointment.meeting_provider);

  if (meetingType && meetingType !== "virtual") {
    return false;
  }

  if (provider === "zoom") {
    return true;
  }

  // Fallback: URL host proves Zoom even if provider casing/legacy field drifts.
  const url = String(appointment.virtualMeetingUrl || appointment.virtual_meeting_url || "").trim();
  return Boolean(url) && /zoom\.(us|gov)/i.test(url);
}

function hasValidZoomMeetingUrl(appointment = {}) {
  const url = String(appointment.virtualMeetingUrl || appointment.virtual_meeting_url || "").trim();

  if (!url) {
    return false;
  }

  try {
    new URL(url);
  } catch {
    return false;
  }

  const provider = normalizeToken(appointment.meetingProvider || appointment.meeting_provider);

  if (provider === "zoom") {
    return true;
  }

  return /zoom\.(us|gov)/i.test(url);
}

export function shouldShowJoinZoomAction(appointment = {}) {
  if (isTerminalAppointmentStatus(appointment)) {
    return false;
  }

  return hasValidZoomMeetingUrl(appointment);
}

/**
 * Scheduled Zoom interview without a persisted join URL (BR-043).
 * Presentation-only warning — never fabricates or regenerates a meeting link.
 */
export function shouldShowZoomLinkUnavailableWarning(appointment = {}) {
  if (isTerminalAppointmentStatus(appointment)) {
    return false;
  }

  if (!isZoomMeetingAppointment(appointment)) {
    return false;
  }

  return !hasValidZoomMeetingUrl(appointment);
}

export function shouldShowCopyZoomLinkAction(appointment = {}) {
  return shouldShowJoinZoomAction(appointment);
}

export function shouldShowLifecycleActions(appointment = {}) {
  return !isTerminalAppointmentStatus(appointment);
}

export function resolveAppointmentMeetingLabel(appointment = {}, translate) {
  const meetingType = normalizeToken(appointment.meetingType || appointment.meeting_type);

  if (meetingType === "virtual") {
    const provider = normalizeToken(appointment.meetingProvider || appointment.meeting_provider);

    if (provider === "zoom") {
      const key = "appointmentsMeetingProvider_zoom";
      const translated = translate?.(key);

      if (translated && translated !== key) {
        return translated;
      }

      return "Zoom";
    }

    const key = `appointmentsMeetingProvider_${provider}`;

    if (provider && translate) {
      const translated = translate(key);

      if (translated !== key) {
        return translated;
      }
    }

    return provider ? provider.replace(/_/g, " ") : translate?.("appointmentsMeetingType_virtual") || "Virtual";
  }

  return (
    appointment.meetingLocationName ||
    appointment.meetingAddress ||
    translate?.("appointmentsMeetingType_in_person") ||
    "In person"
  );
}

export function formatAppointmentMetaLabel(appointment = {}, translate, purposeLabel) {
  const purpose = purposeLabel || appointment.purpose || "";
  const meeting = resolveAppointmentMeetingLabel(appointment, translate);

  return `${purpose} · ${meeting}`;
}

/** Safe diagnostics — never include meeting URLs or credentials. */
export function buildAppointmentZoomDiagnostics(appointment = {}) {
  return {
    meetingType: normalizeToken(appointment.meetingType || appointment.meeting_type) || null,
    meetingProvider: normalizeToken(appointment.meetingProvider || appointment.meeting_provider) || null,
    isZoom: isZoomMeetingAppointment(appointment),
    hasValidZoomMeetingUrl: hasValidZoomMeetingUrl(appointment),
    showJoinZoom: shouldShowJoinZoomAction(appointment),
    showZoomLinkUnavailable: shouldShowZoomLinkUnavailableWarning(appointment),
    terminal: isTerminalAppointmentStatus(appointment)
  };
}
