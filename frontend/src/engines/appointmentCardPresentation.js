/**
 * Appointment card presentation — pure UI rules for Appointments page (BR-043).
 * No backend or lifecycle behavior; visibility and labels only.
 */

const TERMINAL_APPOINTMENT_STATUSES = new Set(["cancelled", "completed"]);

function isTerminalAppointmentStatus(status) {
  return TERMINAL_APPOINTMENT_STATUSES.has(status);
}

function hasValidZoomMeetingUrl(appointment = {}) {
  const url = String(appointment.virtualMeetingUrl || "").trim();

  if (!url) {
    return false;
  }

  try {
    new URL(url);
  } catch {
    return false;
  }

  const provider = String(appointment.meetingProvider || "").toLowerCase();

  if (provider === "zoom") {
    return true;
  }

  return /zoom\.(us|gov)/i.test(url);
}

export function shouldShowJoinZoomAction(appointment = {}) {
  if (isTerminalAppointmentStatus(appointment.status)) {
    return false;
  }

  return hasValidZoomMeetingUrl(appointment);
}

export function shouldShowLifecycleActions(appointment = {}) {
  return !isTerminalAppointmentStatus(appointment.status);
}

export function resolveAppointmentMeetingLabel(appointment = {}, translate) {
  if (appointment.meetingType === "virtual") {
    const provider = String(appointment.meetingProvider || "").toLowerCase();

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
