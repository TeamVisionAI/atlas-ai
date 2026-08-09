/**
 * Recruit AI v2 — scheduling memory across modality / logistics (BR-087).
 * ASK ONLY FOR MISSING INFORMATION; preserve independent scheduling dimensions.
 */

const { formatDateLabel } = require("./dateResolution");
const { pickApprovedZoomUrl } = require("../virtualMeetingUrlResolver");

function hasProposedTime(context) {
  return Boolean(context?.appointment?.proposedTime);
}

function hasProposedDate(context) {
  return Boolean(context?.appointment?.proposedDate);
}

function hasAvailabilityConstraint(context) {
  const c = context?.knownFacts?.availabilityConstraint;
  return Boolean(c?.earliestTime || c?.dayPart === "evening");
}

function resolveDateLabel(context, language = "spanish") {
  if (context?.appointment?.proposedDateLabel) {
    return context.appointment.proposedDateLabel;
  }
  const iso = context?.appointment?.proposedDate;
  if (!iso) {
    return null;
  }
  // Prefer stored label; fall back to weekday from ISO via Date UTC noon.
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) {
    return iso;
  }
  const hint = { kind: "offset", days: 0 };
  // Build a synthetic resolved object for labeling via local weekday of ISO date.
  const weekdayIndex = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  const labels = {
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
  };
  const resolved = {
    isoDate: iso,
    dayName: labels.en[weekdayIndex].toLowerCase(),
    dayNameEs: labels.es[weekdayIndex]
  };
  return formatDateLabel(resolved, language);
}

/**
 * After modality change, resume the next *missing* scheduling step.
 */
function resolvePostModalityScheduling(context, language = "spanish") {
  const proposedTime = context?.appointment?.proposedTime || null;
  const dateLabel = resolveDateLabel(context, language);

  if (proposedTime) {
    return {
      templateKeySuffix: "confirm_slot",
      lastQuestionAsked: "confirm_slot",
      skipDayPart: true,
      entities: {
        requestedTime: proposedTime,
        dateLabel: dateLabel || null,
        requestedDate: context?.appointment?.proposedDate || null
      }
    };
  }

  if (hasAvailabilityConstraint(context)) {
    return {
      templateKeySuffix: "ask_time",
      lastQuestionAsked: "ask_time_preference",
      skipDayPart: true,
      entities: {
        earliestTime:
          context.knownFacts?.availabilityConstraint?.earliestTime || null
      }
    };
  }

  return {
    templateKeySuffix: "ask_day_part",
    lastQuestionAsked: "ask_day_part",
    skipDayPart: false,
    entities: {}
  };
}

/**
 * Qualification resume should not re-ask day-part when constraint/slot known.
 */
function resolveSchedulingQuestionSkip(context) {
  if (hasProposedTime(context)) {
    return {
      templateKey: "confirm_date_with_time",
      lastQuestionAsked: "confirm_slot",
      entities: {
        requestedTime: context.appointment.proposedTime,
        dateLabel: resolveDateLabel(context, "spanish")
      }
    };
  }
  if (hasAvailabilityConstraint(context)) {
    return {
      templateKey: "acknowledge_availability_constraint",
      lastQuestionAsked: "ask_time_preference",
      entities: {
        earliestTime: context.knownFacts.availabilityConstraint.earliestTime
      }
    };
  }
  return null;
}

function resolveZoomLinkFromContext(context = {}) {
  const appointment = context.appointment || {};
  const url = pickApprovedZoomUrl(
    appointment.virtualMeetingUrl,
    appointment.virtual_meeting_url,
    appointment.zoomUrl,
    appointment.zoomLink,
    appointment.meetingUrl
  );
  const status = String(appointment.status || "").toLowerCase();
  const confirmed = status === "confirmed";
  return {
    url,
    confirmed,
    available: Boolean(url)
  };
}

function looksLikeMeetingAccessRequest(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!¡¿.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) {
    return false;
  }
  return (
    /\b(mand(a|ame|ame)? el link|pasame el enlace|pasa el enlace|el link de zoom|enlace de zoom|como entro al zoom|no tengo el enlace|no tengo el link)\b/.test(
      t
    ) ||
    /\b(me puedes mandar el link|me puedes enviar el link|mandame el enlace)\b/.test(
      t
    ) ||
    /\b(send me the link|send the zoom link|can you send the zoom link|what'?s the zoom link|how do i join|i don'?t have the link)\b/.test(
      t
    ) ||
    /\b(zoom link|meeting link|join link)\b/.test(t)
  );
}

function looksLikeRepetitionSignal(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(ya te dije|como te dije|como dije antes|i already told you|i told you already|as i (already )?said)\b/.test(
    t
  );
}

/**
 * BR-119 — prospect wants alternatives later than / outside the current offered set.
 * Ex: "El lunes, pero más tarde"
 */
function looksLikeRequestForLaterAlternatives(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    /\b(mas tarde|later|another time|otra hora|otro horario|algo mas tarde|un poco mas tarde)\b/.test(
      t
    ) || /\b(pero|but)\b[\s\S]{0,24}\b(mas tarde|later)\b/.test(t)
  );
}

module.exports = {
  hasProposedTime,
  hasProposedDate,
  hasAvailabilityConstraint,
  resolveDateLabel,
  resolvePostModalityScheduling,
  resolveSchedulingQuestionSkip,
  resolveZoomLinkFromContext,
  looksLikeMeetingAccessRequest,
  looksLikeRepetitionSignal,
  looksLikeRequestForLaterAlternatives
};
