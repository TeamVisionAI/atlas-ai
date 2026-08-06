/**
 * BR-078 — Canonical WhatsApp template variable builders.
 * Builds ordered parameter objects for approved Meta templates.
 */

const {
  preferredLanguageToCommunicationCode,
  resolveProspectPreferredLanguage
} = require("./prospectLanguage");
const {
  formatAppointmentWhen,
  isVirtualMeeting
} = require("./appointmentConfirmationCopy");
const { isCompleteOfficeAddress } = require("./officeAddressResolver");
const {
  MEETING_TYPES,
  MEETING_LOCATION_TYPES
} = require("./configuration/appointmentDomain");

const MEETING_TYPE_LABELS = Object.freeze({
  en: Object.freeze({
    zoom: "Zoom",
    in_person: "In person",
    public_location: "Public location"
  }),
  es: Object.freeze({
    zoom: "Zoom",
    in_person: "En persona",
    public_location: "Lugar público"
  })
});

function deriveProspectFirstName(prospect = {}, fallbackName = null) {
  const raw = String(
    prospect?.name || prospect?.full_name || fallbackName || ""
  ).trim();
  if (!raw) {
    return "there";
  }

  return raw.split(/\s+/)[0];
}

function resolveLanguageCode(prospect = {}) {
  return preferredLanguageToCommunicationCode(resolveProspectPreferredLanguage(prospect));
}

function resolveMeetingTypeKey(appointment = {}) {
  const locationType = String(
    appointment.meetingLocationType || appointment.meeting_location_type || ""
  ).toLowerCase();

  if (locationType === MEETING_LOCATION_TYPES.PUBLIC_LOCATION || locationType.includes("public")) {
    return "public_location";
  }

  if (isVirtualMeeting(appointment)) {
    return "zoom";
  }

  const meetingType = String(appointment.meetingType || appointment.meeting_type || "").toLowerCase();
  if (meetingType === MEETING_TYPES.IN_PERSON || meetingType.includes("person")) {
    return "in_person";
  }

  return "in_person";
}

function localizeMeetingType(appointment = {}, prospect = {}) {
  const languageCode = resolveLanguageCode(prospect);
  const key = resolveMeetingTypeKey(appointment);
  return MEETING_TYPE_LABELS[languageCode]?.[key] || MEETING_TYPE_LABELS.en[key];
}

function resolveMeetingAddress(appointment = {}, options = {}) {
  const snapshotted =
    appointment.meetingAddress ||
    appointment.meeting_address ||
    options.fallbackAddress ||
    null;

  if (!isCompleteOfficeAddress(snapshotted)) {
    return null;
  }

  return String(snapshotted).trim();
}

function resolveMeetingLocationLabel(appointment = {}, prospect = {}) {
  if (isVirtualMeeting(appointment)) {
    return "Zoom";
  }

  return resolveMeetingAddress(appointment);
}

function isValidHttpsZoomUrl(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") {
      return false;
    }

    return /(^|\.)zoom\.us$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function assertSameOrganization(entityOrgId, expectedOrgId) {
  if (!expectedOrgId) {
    return true;
  }

  if (!entityOrgId) {
    return false;
  }

  return String(entityOrgId) === String(expectedOrgId);
}

function isProspectOptedOut(prospect = {}) {
  return Boolean(
    prospect.do_not_contact ||
      prospect.doNotContact ||
      prospect.opt_out ||
      prospect.optOut ||
      prospect.whatsapp_opt_out ||
      prospect.whatsappOptOut ||
      String(prospect.contact_status || "").toLowerCase() === "opted_out"
  );
}

function orderedObject(keys, values) {
  const result = {};
  keys.forEach((key) => {
    result[key] = values[key];
  });
  return result;
}

function buildLeadWelcomeVariables(prospect = {}) {
  return orderedObject(["prospect_first_name"], {
    prospect_first_name: deriveProspectFirstName(prospect)
  });
}

function buildMissedAppointmentVariables(prospect = {}) {
  return orderedObject(["prospect_first_name"], {
    prospect_first_name: deriveProspectFirstName(prospect)
  });
}

function buildHumanAssistVariables(prospect = {}) {
  return orderedObject(["prospect_first_name"], {
    prospect_first_name: deriveProspectFirstName(prospect)
  });
}

function buildFollowUpVariables(prospect = {}) {
  return orderedObject(["prospect_first_name"], {
    prospect_first_name: deriveProspectFirstName(prospect)
  });
}

function buildInterviewReminderVariables(appointment = {}, prospect = {}) {
  const languageCode = resolveLanguageCode(prospect);
  const interviewWhen = formatAppointmentWhen(appointment, languageCode);

  return orderedObject(["prospect_first_name", "interview_when", "meeting_type"], {
    prospect_first_name: deriveProspectFirstName(prospect, appointment.metadata?.prospectName),
    interview_when: interviewWhen,
    meeting_type: localizeMeetingType(appointment, prospect)
  });
}

function buildInterviewConfirmationVariables(appointment = {}, prospect = {}) {
  const languageCode = resolveLanguageCode(prospect);
  const meetingLocation = resolveMeetingLocationLabel(appointment, prospect);

  return orderedObject(
    ["prospect_first_name", "interview_when", "meeting_type", "meeting_location"],
    {
      prospect_first_name: deriveProspectFirstName(prospect, appointment.metadata?.prospectName),
      interview_when: formatAppointmentWhen(appointment, languageCode),
      meeting_type: localizeMeetingType(appointment, prospect),
      meeting_location: meetingLocation
    }
  );
}

function buildInterviewDetailsVariables(appointment = {}, prospect = {}) {
  return buildInterviewConfirmationVariables(appointment, prospect);
}

function buildOfficeLocationVariables(appointment = {}, prospect = {}, options = {}) {
  const meetingAddress = resolveMeetingAddress(appointment, options);

  return {
    ok: Boolean(meetingAddress),
    reason: meetingAddress ? null : "INCOMPLETE_MEETING_ADDRESS",
    variables: meetingAddress
      ? orderedObject(["prospect_first_name", "meeting_address"], {
          prospect_first_name: deriveProspectFirstName(prospect),
          meeting_address: meetingAddress
        })
      : null
  };
}

function buildZoomInvitationVariables(prospect = {}, meetingUrl = null) {
  if (!isValidHttpsZoomUrl(meetingUrl)) {
    return {
      ok: false,
      reason: "MEETING_URL_UNAVAILABLE_OR_INVALID",
      variables: null,
      buttonVariables: null
    };
  }

  return {
    ok: true,
    reason: null,
    variables: orderedObject(["prospect_first_name"], {
      prospect_first_name: deriveProspectFirstName(prospect)
    }),
    buttonVariables: orderedObject(["meeting_url"], {
      meeting_url: String(meetingUrl).trim()
    })
  };
}

module.exports = {
  MEETING_TYPE_LABELS,
  deriveProspectFirstName,
  localizeMeetingType,
  resolveMeetingAddress,
  resolveMeetingLocationLabel,
  isValidHttpsZoomUrl,
  assertSameOrganization,
  isProspectOptedOut,
  buildLeadWelcomeVariables,
  buildMissedAppointmentVariables,
  buildHumanAssistVariables,
  buildFollowUpVariables,
  buildInterviewReminderVariables,
  buildInterviewConfirmationVariables,
  buildInterviewDetailsVariables,
  buildOfficeLocationVariables,
  buildZoomInvitationVariables
};
