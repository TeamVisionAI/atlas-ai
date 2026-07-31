/**
 * Structured outbound communication payload for preview and send parity.
 * Message text always comes from composeWhatsAppMessage via buildMessageContext.
 */

const {
  formatPreferredLanguageLabel,
  resolveProspectPreferredLanguage
} = require("./prospectLanguage");
const {
  formatInterviewSchedule,
  DEFAULT_TIMEZONE,
  WHATSAPP_TEMPLATES
} = require("./whatsappCommunicationEngine");

const MISSING_KEYS = Object.freeze({
  REPRESENTATIVE_NAME: "representativeName",
  REPRESENTATIVE_TITLE: "representativeTitle",
  ZOOM_LINK: "zoomLink",
  OFFICE_LOCATION: "officeLocation",
  INTERVIEW_SCHEDULE: "interviewSchedule",
  ORGANIZATION_NAME: "organizationName",
  PROSPECT_NAME: "prospectName",
  PROFILE_PHOTO: "profilePhoto",
  OFFICE_LOGO: "officeLogo",
  SIGNATURE: "signature"
});

function normalizeInterviewTypeLabel(interviewType, language) {
  const channel = String(interviewType || "").toLowerCase();

  if (channel === "zoom") {
    return language === "es" ? "Entrevista por Zoom" : "Zoom Interview";
  }

  if (channel === "office") {
    return language === "es" ? "Entrevista presencial" : "In-Person Interview";
  }

  return interviewType || null;
}

function resolveRepresentativeTitle(representative) {
  return representative?.title || null;
}

function buildInterviewScheduleBlock(interviewAtMs, timezone, language) {
  if (!interviewAtMs) {
    return null;
  }

  const schedule = formatInterviewSchedule(interviewAtMs, timezone || DEFAULT_TIMEZONE, language);

  return {
    dateLine: schedule.dateLine,
    timeLine: schedule.timeLine,
    timezoneAbbreviation: schedule.timezoneAbbreviation,
    timezoneLabel: schedule.timezoneLabel,
    iso: new Date(interviewAtMs).toISOString()
  };
}

function buildMissingContent({
  prospectName,
  representative,
  recruiterName,
  interviewSchedule,
  interviewType,
  zoomUrl,
  office,
  media
}) {
  const missing = [];
  const resolvedRepresentativeName = representative?.name || recruiterName || null;

  if (!prospectName) {
    missing.push({ key: MISSING_KEYS.PROSPECT_NAME, severity: "error", category: "required" });
  }

  if (!resolvedRepresentativeName) {
    missing.push({ key: MISSING_KEYS.REPRESENTATIVE_NAME, severity: "error", category: "required" });
  }

  if (!interviewSchedule) {
    missing.push({ key: MISSING_KEYS.INTERVIEW_SCHEDULE, severity: "error", category: "required" });
  }

  const channel = String(interviewType || "").toLowerCase();

  if (channel === "zoom" && !zoomUrl) {
    missing.push({ key: MISSING_KEYS.ZOOM_LINK, severity: "error", category: "required" });
  }

  if (channel === "office" && !office?.fullAddress) {
    missing.push({ key: MISSING_KEYS.OFFICE_LOCATION, severity: "error", category: "required" });
  }

  if (!media?.profilePhotoUrl) {
    missing.push({ key: MISSING_KEYS.PROFILE_PHOTO, severity: "recommended", category: "recommended" });
  }

  if (!media?.officeLogoUrl) {
    missing.push({ key: MISSING_KEYS.OFFICE_LOGO, severity: "recommended", category: "recommended" });
  }

  if (!representative?.title) {
    missing.push({ key: MISSING_KEYS.REPRESENTATIVE_TITLE, severity: "recommended", category: "recommended" });
  }

  return missing;
}

/**
 * @param {Object} params
 * @param {Object} params.built - Result from buildMessageContext (message, template, language, zoomUrl, context)
 * @param {Object} params.prospect
 * @param {Object|null} params.representative
 * @param {boolean} params.representativeFallbackUsed
 * @param {Object|null} params.appointment
 * @param {Object|null} params.organizationSettings
 * @param {string} params.channel
 * @param {string} params.deliveryMode
 */
function buildOutboundCommunicationPayload({
  built,
  prospect,
  representative = null,
  representativeFallbackUsed = false,
  appointment = null,
  organizationSettings = null,
  channel = "whatsapp",
  deliveryMode = "copy_open"
}) {
  const context = built.context || {};
  const language = built.language || context.language || "en";
  const preferredLanguage = resolveProspectPreferredLanguage(prospect);
  const interviewSchedule = buildInterviewScheduleBlock(
    context.interviewAtMs,
    context.timezone,
    language
  );
  const interviewType = context.interviewType || null;
  const organizationName = context.organizationName || organizationSettings?.organizationName || null;
  const office = context.office || organizationSettings?.office || null;
  const signatureText = organizationName;
  const resolvedRepresentativeName = representative?.name || context.recruiterName || null;
  const resolvedRepresentative = resolvedRepresentativeName
    ? {
        ...(representative || {}),
        name: resolvedRepresentativeName
      }
    : representative;

  const media = {
    profilePhotoUrl: representative?.profilePhotoUrl || representative?.profile_photo_url || null,
    officeLogoUrl: organizationSettings?.logoUrl || organizationSettings?.officeLogoUrl || null,
    headerImageUrl: null,
    contactCard: representative
      ? {
          name: representative.name,
          phone: representative.phone || null,
          email: representative.email || null
        }
      : null,
    attachments: []
  };

  const location =
    String(interviewType || "").toLowerCase() === "zoom"
      ? {
          type: "zoom",
          zoomUrl: built.zoomUrl || context.zoomUrl || null
        }
      : {
          type: "office",
          name: office?.name || null,
          fullAddress: office?.fullAddress || null,
          mapsUrl: office?.mapsUrl || null
        };

  const missingContent = buildMissingContent({
    prospectName: context.prospectName || prospect?.name,
    representative: resolvedRepresentative,
    recruiterName: context.recruiterName,
    interviewSchedule,
    interviewType,
    zoomUrl: built.zoomUrl || context.zoomUrl || null,
    office,
    media
  });

  return {
    channel,
    deliveryMode,
    template: built.template,
    language,
    languageLabel: formatPreferredLanguageLabel(preferredLanguage),
    preferredLanguage,
    phone: built.phone || prospect?.phone || null,
    prospectName: context.prospectName || prospect?.name || null,
    interview: {
      type: interviewType,
      typeLabel: normalizeInterviewTypeLabel(interviewType, language),
      schedule: interviewSchedule,
      appointmentId: appointment?.id || null
    },
    location,
    representative: resolvedRepresentative
      ? {
          name: resolvedRepresentative.name || null,
          title: resolveRepresentativeTitle(resolvedRepresentative),
          organization: organizationName,
          phone: resolvedRepresentative.phone || null,
          email: resolvedRepresentative.email || null,
          repId: resolvedRepresentative.repId || null,
          preferredLanguage: resolvedRepresentative.preferredLanguage || null,
          fallbackUsed: representativeFallbackUsed
        }
      : null,
    media,
    signature: signatureText,
    message: built.message,
    missingContent,
    formatting: {
      plainText: true,
      whatsAppCloudTemplate: false,
      preservesLineBreaks: true
    }
  };
}

function payloadsMatchForSend(previewPayload, sendPayload) {
  if (!previewPayload || !sendPayload) {
    return false;
  }

  return (
    previewPayload.message === sendPayload.message &&
    previewPayload.template === sendPayload.template &&
    previewPayload.language === sendPayload.language &&
    previewPayload.phone === sendPayload.phone
  );
}

module.exports = {
  MISSING_KEYS,
  buildOutboundCommunicationPayload,
  payloadsMatchForSend
};
