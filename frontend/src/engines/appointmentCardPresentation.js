/**
 * Appointment card presentation — pure UI rules for Appointments page (BR-043).
 * No backend or lifecycle behavior; visibility and labels only.
 */

import { buildConversationHeaderModel } from "./conversationsCenterPresentation.js";
import { hasCanonicalRecordedOutcome } from "./appointmentOutcomeState.js";

const TERMINAL_APPOINTMENT_STATUSES = new Set(["cancelled", "completed"]);
const SYNTHETIC_BSUID_PREFIX = "wa:bsuid:";
const IN_PERSON_LOCATION_TYPES = new Set(["office", "public_location"]);

function isTerminalAppointmentStatus(appointment = {}) {
  const status = String(appointment.status || "").toLowerCase();
  const lifecycle = String(appointment.metadata?.lifecycleState || "").toLowerCase();

  return (
    hasCanonicalRecordedOutcome(appointment) ||
    TERMINAL_APPOINTMENT_STATUSES.has(status) ||
    lifecycle === "cancelled" ||
    lifecycle === "completed" ||
    lifecycle === "recruited" ||
    lifecycle === "became_client" ||
    lifecycle === "no_show"
  );
}

export function isSyntheticWhatsAppStorageKey(value) {
  return String(value || "").trim().startsWith(SYNTHETIC_BSUID_PREFIX);
}

function formatUsernameHandle(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^@+/, "");
  return raw ? `@${raw}` : null;
}

function resolveVisibleProspectPhone(appointment = {}) {
  if (appointment.prospectVisiblePhone) {
    return String(appointment.prospectVisiblePhone).trim();
  }

  const agendaPhone = String(appointment.metadata?.agendaContactPhone || "").trim();
  const phone = String(appointment.prospectPhone || agendaPhone || "").trim();

  if (!phone || isSyntheticWhatsAppStorageKey(phone)) {
    return null;
  }

  return phone;
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

export function isZoomMeetingMode(appointment = {}) {
  const meetingType = String(appointment.meetingType || "").toLowerCase();
  const provider = String(appointment.meetingProvider || "").toLowerCase();

  if (meetingType === "virtual" && provider === "zoom") {
    return true;
  }

  return provider === "zoom" && hasValidZoomMeetingUrl(appointment);
}

export function shouldShowJoinZoomAction(appointment = {}) {
  if (isTerminalAppointmentStatus(appointment)) {
    return false;
  }

  if (!isZoomMeetingMode(appointment)) {
    return false;
  }

  return hasValidZoomMeetingUrl(appointment);
}

export function shouldShowLifecycleActions(appointment = {}) {
  return !isTerminalAppointmentStatus(appointment);
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

  const locationType = String(appointment.meetingLocationType || "").toLowerCase();

  if (locationType === "office") {
    const key = "appointmentsMeetingLocation_office";
    const translated = translate?.(key);
    return translated && translated !== key ? translated : "Office";
  }

  if (locationType === "public_location") {
    return (
      appointment.meetingLocationName ||
      translate?.("appointmentsMeetingLocation_public_location") ||
      "Public location"
    );
  }

  if (appointment.meetingType === "in_person") {
    return translate?.("appointmentsMeetingType_in_person") || "In person";
  }

  return (
    appointment.meetingLocationName ||
    translate?.("appointmentsMeetingType_in_person") ||
    "In person"
  );
}

export function formatAppointmentMetaLabel(appointment = {}, translate, purposeLabel) {
  const purpose = purposeLabel || appointment.purpose || "";
  const meeting = resolveAppointmentMeetingLabel(appointment, translate);

  return `${purpose} · ${meeting}`;
}

/**
 * Contact identity row for appointment cards (reuses Conversations header safety rules).
 */
export function buildAppointmentCardContactModel(appointment = {}, options = {}) {
  const phoneUnavailableLabel = options.phoneUnavailableLabel || "Phone unavailable";
  const visiblePhone = resolveVisibleProspectPhone(appointment);
  const usernameHandle = formatUsernameHandle(appointment.prospectWhatsAppUsername);

  buildConversationHeaderModel({
    name: appointment.prospectName,
    phone: appointment.prospectPhone,
    displayIdentity: appointment.prospectDisplayIdentity,
    hasVisiblePhone: appointment.prospectHasVisiblePhone ?? Boolean(visiblePhone)
  });

  let contactLabel = phoneUnavailableLabel;
  let contactKind = "unavailable";
  let telHref = null;
  let copyValue = null;

  if (visiblePhone) {
    contactLabel = visiblePhone;
    contactKind = "phone";
    telHref = `tel:${visiblePhone}`;
    copyValue = visiblePhone;
  } else if (usernameHandle) {
    contactLabel = usernameHandle;
    contactKind = "username";
    copyValue = usernameHandle;
  }

  const syntheticKey = isSyntheticWhatsAppStorageKey(appointment.prospectPhone);

  return {
    contactLabel,
    contactKind,
    telHref,
    copyValue,
    exposesSyntheticKey:
      syntheticKey && contactKind === "unavailable" && !usernameHandle
  };
}

export function shouldShowInPersonAddress(appointment = {}) {
  if (isZoomMeetingMode(appointment)) {
    return false;
  }

  const meetingType = String(appointment.meetingType || "").toLowerCase();
  const locationType = String(appointment.meetingLocationType || "").toLowerCase();
  const address = String(appointment.meetingAddress || "").trim();

  if (!address) {
    return false;
  }

  if (meetingType === "virtual") {
    return false;
  }

  if (meetingType === "in_person") {
    return true;
  }

  return IN_PERSON_LOCATION_TYPES.has(locationType);
}

export function formatInPersonAddressLines(address) {
  const raw = String(address || "").trim();

  if (!raw) {
    return [];
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 2) {
    return [raw];
  }

  return [parts.slice(0, -2).join(", "), parts.slice(-2).join(", ")];
}

export function buildMapsDirectionsUrl(address) {
  const query = String(address || "").trim();

  if (!query) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildAppointmentCardAddressModel(appointment = {}) {
  const address = String(appointment.meetingAddress || "").trim();

  if (!shouldShowInPersonAddress(appointment) || !address) {
    return null;
  }

  return {
    lines: formatInPersonAddressLines(address),
    mapsUrl: buildMapsDirectionsUrl(address),
    fullAddress: address
  };
}

/** Action buttons wrap at every width so localized labels stay inside the card. */
export function resolveAppointmentActionRowLayoutMode(_viewportWidth = 1280) {
  return "wrap";
}

export function appointmentCardAllowsHorizontalOverflow(_viewportWidth = 375) {
  return false;
}
