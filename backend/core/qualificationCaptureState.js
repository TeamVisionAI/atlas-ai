/**
 * Sprint 21.3+ — Tracks fields explicitly collected during the active conversation.
 * Sprint 21.4 — city → state → authorization → interviewType → dayPart → schedule → name → email
 * Stored in prospect.notes as QUAL_CAPTURE:{...} alongside scheduling/email segments.
 */

const QUAL_CAPTURE_PREFIX = "QUAL_CAPTURE:";

function defaultCaptureState() {
  return {
    city: false,
    state: false,
    authorization: false,
    interviewType: false,
    dayPart: false,
    name: false,
    email: false,
    /** BR-082 — consecutive unrecognized day-part replies */
    dayPartClarifyAttempts: 0
  };
}

function hasQualificationCaptureMarker(notes) {
  return String(notes || "").includes(QUAL_CAPTURE_PREFIX);
}

function parseQualificationCapture(notes) {
  if (!notes) {
    return defaultCaptureState();
  }

  const match = String(notes).match(/QUAL_CAPTURE:({[\s\S]*?})(?:\||$)/);

  if (!match) {
    return defaultCaptureState();
  }

  try {
    const parsed = {
      ...defaultCaptureState(),
      ...JSON.parse(match[1])
    };

    delete parsed.occupation;

    return parsed;
  } catch (error) {
    return defaultCaptureState();
  }
}

function encodeQualificationCapture(captureState) {
  const payload = {
    ...defaultCaptureState(),
    ...(captureState || {})
  };

  delete payload.occupation;

  return `${QUAL_CAPTURE_PREFIX}${JSON.stringify(payload)}`;
}

function stripQualificationCapture(notes) {
  return String(notes || "")
    .replace(/\|?QUAL_CAPTURE:{[\s\S]*?}(?:\||$)/, "")
    .replace(/^\|+/, "")
    .trim();
}

function mergeNotesWithQualificationCapture(existingNotes, captureState) {
  const remainder = stripQualificationCapture(existingNotes);
  const encoded = encodeQualificationCapture(captureState);

  if (!remainder) {
    return encoded;
  }

  return `${encoded}|${remainder}`;
}

function markCapturedFields(captureState, extracted = {}) {
  const next = { ...defaultCaptureState(), ...captureState };

  if (extracted.authorization !== undefined && extracted.authorization !== null) {
    next.authorization = true;
  }

  if (extracted.city) {
    next.city = true;
  }

  // BR-082: only explicit/confirmed state counts — never proposedState alone.
  if (extracted.state && !extracted.stateProposedOnly) {
    next.state = true;
  }

  if (typeof extracted.dayPartClarifyAttempts === "number") {
    next.dayPartClarifyAttempts = extracted.dayPartClarifyAttempts;
  }

  if (extracted.interviewType) {
    next.interviewType = true;
  }

  if (extracted.dayPart || extracted.preferredPeriod) {
    next.dayPart = true;
  }

  if (extracted.name) {
    next.name = true;
  }

  if (extracted.email || extracted.emailSkipped) {
    next.email = true;
  }

  return next;
}

function isExplicitCaptureActive(notes) {
  return hasQualificationCaptureMarker(notes);
}

function isCityExplicitlyCaptured(profile, captureState, notes) {
  if (!profile?.city) {
    return false;
  }

  if (isExplicitCaptureActive(notes)) {
    return captureState.city === true;
  }

  return true;
}

function isStateExplicitlyCaptured(profile, captureState, notes) {
  if (!profile?.state) {
    return false;
  }

  if (isExplicitCaptureActive(notes)) {
    return captureState.state === true;
  }

  return true;
}

function isAuthorizationExplicitlyCaptured(profile, captureState, notes) {
  if (isExplicitCaptureActive(notes)) {
    return captureState.authorization === true;
  }

  return profile?.authorization !== null && profile?.authorization !== undefined;
}

function isInterviewTypeExplicitlyCaptured(profile, captureState, notes) {
  if (isExplicitCaptureActive(notes)) {
    return captureState.interviewType === true;
  }

  return Boolean(profile?.interviewType);
}

function isDayPartExplicitlyCaptured(profile, captureState, notes) {
  if (isExplicitCaptureActive(notes)) {
    return captureState.dayPart === true;
  }

  return Boolean(profile?.dayPart);
}

function isLocationExplicitlyComplete(profile, captureState, notes) {
  return (
    isCityExplicitlyCaptured(profile, captureState, notes) &&
    isStateExplicitlyCaptured(profile, captureState, notes)
  );
}

function isNameExplicitlyCaptured(profile, captureState, notes) {
  if (!profile?.name) {
    return false;
  }

  if (isExplicitCaptureActive(notes)) {
    return captureState.name === true;
  }

  return true;
}

function isEmailStepComplete(profile, captureState, notes) {
  if (profile?.email) {
    return true;
  }

  if (isExplicitCaptureActive(notes)) {
    return captureState.email === true;
  }

  return Boolean(profile?.email);
}

function explainSchedulingEligibility(profile, captureState, notes, missingFields) {
  if (!isCityExplicitlyCaptured(profile, captureState, notes)) {
    return captureState.city === false && profile.city
      ? "blocked: city present in profile but not explicitly captured this conversation"
      : "blocked: city not captured";
  }

  if (!isStateExplicitlyCaptured(profile, captureState, notes)) {
    return captureState.state === false && profile.state
      ? "blocked: state present in profile but not explicitly captured this conversation"
      : "blocked: state not captured";
  }

  if (missingFields.includes("authorization")) {
    return captureState.authorization === false && profile.authorization !== null && profile.authorization !== undefined
      ? "blocked: authorization present in profile but not explicitly captured this conversation"
      : "blocked: authorization not captured";
  }

  if (profile.authorization === false) {
    return "blocked: not authorized to work in the United States";
  }

  if (missingFields.includes("interviewType")) {
    return "blocked: interview format not established";
  }

  if (missingFields.includes("dayPart")) {
    return "blocked: morning/afternoon preference not captured";
  }

  if (!profile.interviewType && !missingFields.includes("schedule")) {
    return "blocked: interview type unresolved";
  }

  if (missingFields.includes("schedule")) {
    return "eligible: pre-schedule qualification complete";
  }

  if (missingFields.includes("name")) {
    return "blocked: full name not captured after scheduling";
  }

  if (missingFields.includes("email")) {
    return "blocked: optional email step not completed";
  }

  return "blocked: schedule already complete or not next";
}

module.exports = {
  defaultCaptureState,
  hasQualificationCaptureMarker,
  parseQualificationCapture,
  encodeQualificationCapture,
  mergeNotesWithQualificationCapture,
  markCapturedFields,
  isExplicitCaptureActive,
  isCityExplicitlyCaptured,
  isStateExplicitlyCaptured,
  isAuthorizationExplicitlyCaptured,
  isInterviewTypeExplicitlyCaptured,
  isDayPartExplicitlyCaptured,
  isLocationExplicitlyComplete,
  isNameExplicitlyCaptured,
  isEmailStepComplete,
  explainSchedulingEligibility
};
