/**
 * BR-077 — Canonical office address selection for in-person appointments.
 * Snapshots the complete same-org address (including suite/unit); never uses
 * truncated hardcoded fallbacks or partial field joins that hide fullAddress.
 */

const { MEETING_TYPES } = require("./configuration/appointmentDomain");
const { isTeamVisionSeedTenant } = require("./teamVisionSeedTenant");

const OFFICE_ADDRESS_SOURCES = Object.freeze({
  PERSISTED_APPOINTMENT: "persisted_appointment",
  REQUEST: "request",
  MEETING_MANAGEMENT: "meeting_management",
  ORGANIZATION_PROFILE: "organization_profile",
  UNAVAILABLE: "unavailable"
});

const OFFICE_ADDRESS_STATUSES = Object.freeze({
  CONFIGURED: "configured",
  UNAVAILABLE: "unavailable",
  NOT_APPLICABLE: "not_applicable"
});

/**
 * True when value looks like a complete street address (not a city/state fragment).
 * @param {unknown} value
 * @returns {boolean}
 */
function isCompleteOfficeAddress(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  if (trimmed.length < 12) {
    return false;
  }

  // Reject city/state-only fragments produced by the old field-join bug ("Doral, FL").
  if (/^[A-Za-z .'-]+,\s*[A-Z]{2}$/.test(trimmed)) {
    return false;
  }

  // Prefer addresses that include a street number.
  if (!/\d/.test(trimmed)) {
    return false;
  }

  return true;
}

function normalizeMeetingType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isInPersonMeeting(meetingType) {
  return normalizeMeetingType(meetingType) === MEETING_TYPES.IN_PERSON;
}

/**
 * Build a complete address from structured office fields.
 * Prefer fullAddress — never emit a partial join when fullAddress exists.
 * @param {object|null|undefined} office
 * @returns {string|null}
 */
function composeOfficeAddressFromOfficeModel(office = null) {
  if (!office || typeof office !== "object") {
    return null;
  }

  if (isCompleteOfficeAddress(office.fullAddress)) {
    return String(office.fullAddress).trim();
  }

  const streetLine = [office.street || office.address, office.suite]
    .filter(Boolean)
    .join(", ");
  const composed = [
    streetLine || null,
    office.city || null,
    [office.state, office.zip || office.postalCode].filter(Boolean).join(" ").trim() || null
  ]
    .filter(Boolean)
    .join(", ");

  return isCompleteOfficeAddress(composed) ? composed : null;
}

function buildResult({ address = null, status, source } = {}) {
  return {
    address: address || null,
    status,
    source
  };
}

/**
 * Resolve canonical in-person office address (BR-077).
 *
 * Precedence:
 * 1. valid persisted appointment meeting_address (preserve)
 * 2. valid explicit request/appointment address
 * 3. Meeting Management officeAddress
 * 4. BR-018 organization fullAddress (Team Vision seed only)
 * 5. unavailable — never substitute Team Vision for another tenant (BR-146)
 *
 * @param {object} input
 * @param {string} [input.organizationId]
 * @param {string} [input.meetingType]
 * @param {object|null} [input.persistedAppointment]
 * @param {string|null} [input.requestAddress]
 * @param {object} [deps]
 */
async function resolveCanonicalOfficeAddress(input = {}, deps = {}) {
  const meetingType = normalizeMeetingType(input.meetingType);
  const organizationId = input.organizationId || null;

  if (meetingType && !isInPersonMeeting(meetingType)) {
    return buildResult({
      address: null,
      status: OFFICE_ADDRESS_STATUSES.NOT_APPLICABLE,
      source: OFFICE_ADDRESS_SOURCES.UNAVAILABLE
    });
  }

  const persisted = input.persistedAppointment || null;
  const persistedAddress =
    persisted?.meetingAddress || persisted?.meeting_address || null;

  if (isCompleteOfficeAddress(persistedAddress)) {
    return buildResult({
      address: String(persistedAddress).trim(),
      status: OFFICE_ADDRESS_STATUSES.CONFIGURED,
      source: OFFICE_ADDRESS_SOURCES.PERSISTED_APPOINTMENT
    });
  }

  if (isCompleteOfficeAddress(input.requestAddress)) {
    return buildResult({
      address: String(input.requestAddress).trim(),
      status: OFFICE_ADDRESS_STATUSES.CONFIGURED,
      source: OFFICE_ADDRESS_SOURCES.REQUEST
    });
  }

  if (organizationId) {
    const getMeetingManagement =
      deps.getMeetingManagement ||
      require("../services/meetingManagementService").getMeetingManagement;

    const meetingManagement = await getMeetingManagement(organizationId);
    const mmAddress = meetingManagement?.officeAddress || null;

    if (isCompleteOfficeAddress(mmAddress)) {
      return buildResult({
        address: String(mmAddress).trim(),
        status: OFFICE_ADDRESS_STATUSES.CONFIGURED,
        source: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
      });
    }
  }

  // Implements BR-146 — seed office profile is Team Vision only.
  if (isTeamVisionSeedTenant(organizationId)) {
    const getOrganizationSettings =
      deps.getOrganizationSettings ||
      require("./organizationSettingsEngine").getOrganizationSettings;

    const orgOffice = getOrganizationSettings()?.office || null;
    const orgAddress = composeOfficeAddressFromOfficeModel(orgOffice);

    if (isCompleteOfficeAddress(orgAddress)) {
      return buildResult({
        address: orgAddress,
        status: OFFICE_ADDRESS_STATUSES.CONFIGURED,
        source: OFFICE_ADDRESS_SOURCES.ORGANIZATION_PROFILE
      });
    }
  }

  return buildResult({
    address: null,
    status: OFFICE_ADDRESS_STATUSES.UNAVAILABLE,
    source: OFFICE_ADDRESS_SOURCES.UNAVAILABLE
  });
}

function buildOfficeAddressDiagnostics(resolution = {}) {
  return {
    status: resolution.status || null,
    source: resolution.source || null,
    hasAddress: Boolean(resolution.address),
    includesSuite: /\bsuite\b|\bste\b|\bunit\b|#\s*\w+/i.test(
      String(resolution.address || "")
    )
  };
}

module.exports = {
  OFFICE_ADDRESS_SOURCES,
  OFFICE_ADDRESS_STATUSES,
  isCompleteOfficeAddress,
  isInPersonMeeting,
  composeOfficeAddressFromOfficeModel,
  resolveCanonicalOfficeAddress,
  buildOfficeAddressDiagnostics
};
