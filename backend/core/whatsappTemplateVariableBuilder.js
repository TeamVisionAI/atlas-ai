/**
 * BR-078 / BR-092 / BR-093 — Canonical WhatsApp template variable builders.
 * Builds ordered parameter objects for approved Meta templates.
 * Zoom invitation button params are Meta dynamic URL suffixes (BR-092), not full URLs.
 * Confirmation/details {{4}} meeting_location is real meeting details (BR-093), not meeting_type.
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
const { isApprovedHttpsZoomUrl } = require("./virtualMeetingUrlResolver");

/**
 * Meta-approved Zoom invitation URL button base (WABA audit):
 * https://zoom.us/j/{{1}}
 * {{1}} must be only the suffix after that base (meeting id [+ supported query]).
 */
const META_ZOOM_INVITATION_URL_BUTTON_BASE = "https://zoom.us/j/";

/** Safe Meta dynamic suffix: meeting id, optional query — never a host or /j/ prefix. */
const SAFE_ZOOM_BUTTON_SUFFIX_RE = /^[A-Za-z0-9._-]+(?:\?[^\s#]*)?$/;

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

/**
 * BR-093 — Canonical confirmation/details BODY {{4}} copy for Zoom meetings.
 * Must not duplicate meeting_type ("Zoom") and must not embed the Zoom URL
 * (atlas_zoom_invitation_* owns the join button).
 */
const ZOOM_MEETING_DETAILS_COPY = Object.freeze({
  en: "Your Zoom link will be provided separately",
  es: "Tu enlace de Zoom será enviado por separado"
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

/**
 * BR-093 — Resolve confirmation/details BODY {{4}} (meeting_location / meeting details).
 * Zoom → language-specific “link provided separately” copy (never URL, never bare "Zoom").
 * In-person / public location → canonical address (BR-077). Missing address → null (fail closed).
 */
function resolveMeetingLocationLabel(appointment = {}, prospect = {}) {
  if (isVirtualMeeting(appointment)) {
    const languageCode = resolveLanguageCode(prospect);
    return (
      ZOOM_MEETING_DETAILS_COPY[languageCode] || ZOOM_MEETING_DETAILS_COPY.en
    );
  }

  // Office / public_location / other non-virtual: require canonical address details.
  return resolveMeetingAddress(appointment);
}

function isValidHttpsZoomUrl(value) {
  // Implements BR-076 host approval for Zoom invitation inputs.
  return isApprovedHttpsZoomUrl(value);
}

/**
 * BR-092 — Normalize a Zoom value into the Meta dynamic URL button parameter.
 * Meta template base is https://zoom.us/j/{{1}}; {{1}} must not include a leading j/.
 *
 * Accepts canonical BR-076 URLs and defensive relative/already-normalized forms.
 * Does not mutate persisted appointment Zoom URLs.
 *
 * @param {unknown} value
 * @returns {{ ok: boolean, reason: string|null, parameter: string|null }}
 */
function normalizeZoomDynamicUrlButtonParameter(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /\s/.test(raw)) {
    return {
      ok: false,
      reason: "MEETING_URL_UNAVAILABLE_OR_INVALID",
      parameter: null
    };
  }

  let pathAndQuery = null;

  if (/^https?:\/\//i.test(raw)) {
    if (!isApprovedHttpsZoomUrl(raw)) {
      return {
        ok: false,
        reason: "MEETING_URL_UNAVAILABLE_OR_INVALID",
        parameter: null
      };
    }

    try {
      const parsed = new URL(raw);
      pathAndQuery = `${parsed.pathname || ""}${parsed.search || ""}`;
    } catch {
      return {
        ok: false,
        reason: "MEETING_URL_UNAVAILABLE_OR_INVALID",
        parameter: null
      };
    }
  } else if (/^\/?j\//i.test(raw)) {
    pathAndQuery = raw.startsWith("/") ? raw : `/${raw}`;
  } else {
    // Already-normalized meeting id / suffix (no host, no j/ prefix).
    const bare = raw.replace(/^\//, "");
    if (!SAFE_ZOOM_BUTTON_SUFFIX_RE.test(bare) || /^j\//i.test(bare)) {
      return {
        ok: false,
        reason: "MEETING_URL_UNAVAILABLE_OR_INVALID",
        parameter: null
      };
    }
    return { ok: true, reason: null, parameter: bare };
  }

  const joinMatch = String(pathAndQuery || "").match(/\/j\/(.+)$/i);
  if (!joinMatch || !joinMatch[1]) {
    return {
      ok: false,
      reason: "MEETING_URL_UNAVAILABLE_OR_INVALID",
      parameter: null
    };
  }

  let suffix = joinMatch[1];
  // Defense: strip accidental repeated j/ segments so Meta never gets j/j/{id}.
  while (/^j\//i.test(suffix)) {
    suffix = suffix.replace(/^j\//i, "");
  }

  if (!suffix || !SAFE_ZOOM_BUTTON_SUFFIX_RE.test(suffix)) {
    return {
      ok: false,
      reason: "MEETING_URL_UNAVAILABLE_OR_INVALID",
      parameter: null
    };
  }

  return { ok: true, reason: null, parameter: suffix };
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
  // Implements BR-093 — {{4}} meeting details distinct from {{3}} meeting type.
  const meetingLocation = resolveMeetingLocationLabel(appointment, prospect);

  return orderedObject(
    ["prospect_first_name", "interview_when", "meeting_type", "meeting_location"],
    {
      prospect_first_name: deriveProspectFirstName(prospect, appointment.metadata?.prospectName),
      interview_when: formatAppointmentWhen(appointment, languageCode),
      meeting_type: localizeMeetingType(appointment, prospect),
      // null/empty → BR-075/078 template resolve fails closed (TEMPLATE_VARIABLES_INVALID).
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
  // Button parameter adaptation to Meta's https://zoom.us/j/{{1}} suffix (BR-092).
  // Canonical persisted Zoom URLs remain unchanged (BR-076); only the template param is adapted.
  const normalized = normalizeZoomDynamicUrlButtonParameter(meetingUrl);
  if (!normalized.ok) {
    return {
      ok: false,
      reason: normalized.reason || "MEETING_URL_UNAVAILABLE_OR_INVALID",
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
      // Meta dynamic URL button {{1}} — meeting id / suffix only (not full URL, not j/{id}).
      meeting_url: normalized.parameter
    })
  };
}

module.exports = {
  MEETING_TYPE_LABELS,
  META_ZOOM_INVITATION_URL_BUTTON_BASE,
  ZOOM_MEETING_DETAILS_COPY,
  deriveProspectFirstName,
  localizeMeetingType,
  resolveMeetingAddress,
  resolveMeetingLocationLabel,
  isValidHttpsZoomUrl,
  normalizeZoomDynamicUrlButtonParameter,
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
