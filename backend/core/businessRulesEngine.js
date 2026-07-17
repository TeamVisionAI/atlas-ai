const {
  isWithinSchedulingWindow,
  SCHEDULING_WINDOW_START_MINUTES,
  SCHEDULING_WINDOW_END_MINUTES
} = require("./capacityEngine");
const { isUnemployed } = require("./languageLibrary");

const INTERVIEW_TYPES = {
  IN_PERSON: "In Person",
  ZOOM: "Zoom"
};

const COVERAGE = {
  LOCAL: "LOCAL",
  OUTSIDE: "OUTSIDE"
};

const OFFICE_LOCATION = {
  name: "Team Vision Office",
  street: "2500 NW 79th Ave",
  suite: "Suite 189",
  city: "Doral",
  state: "FL",
  zip: "33122",
  fullAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122"
};

const LOCAL_RADIUS_MILES = 25;

const LOCAL_CITIES = [
  "doral",
  "miami",
  "hialeah",
  "miami lakes",
  "miami springs",
  "sweetwater",
  "westchester",
  "kendall",
  "coral gables",
  "south miami",
  "pinecrest",
  "palmetto bay",
  "cutler bay",
  "homestead",
  "aventura",
  "sunny isles beach",
  "north miami",
  "north miami beach",
  "miami beach",
  "miramar",
  "pembroke pines",
  "hollywood",
  "fort lauderdale",
  "davie",
  "weston",
  "plantation",
  "sunrise",
  "tamiami",
  "west miami",
  "medley",
  "virginia gardens"
];

const IN_PERSON_REQUEST_PATTERNS = [
  "in person",
  "in-person",
  "office",
  "presencial",
  "oficina",
  "personally",
  "en persona"
];

const ZOOM_REQUEST_PATTERNS = [
  "zoom",
  "virtual",
  "online",
  "remoto",
  "video"
];

function normalize(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getOfficeLocation() {
  return { ...OFFICE_LOCATION };
}

function isLocalCity(city = "") {
  return LOCAL_CITIES.includes(normalize(city));
}

function evaluateCoverage({ city, state = null }) {
  void state;

  const isLocal = isLocalCity(city);

  return {
    coverage: isLocal ? COVERAGE.LOCAL : COVERAGE.OUTSIDE,
    defaultInterviewType: isLocal ? INTERVIEW_TYPES.IN_PERSON : INTERVIEW_TYPES.ZOOM,
    officeLocation: isLocal ? getOfficeLocation() : null,
    messageKey: isLocal ? "LOCAL_DEFAULT" : "OUTSIDE_DEFAULT",
    localRadiusMiles: LOCAL_RADIUS_MILES
  };
}

function detectRequestedInterviewType(message = "") {
  const text = normalize(message);

  if (ZOOM_REQUEST_PATTERNS.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.ZOOM;
  }

  if (IN_PERSON_REQUEST_PATTERNS.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.IN_PERSON;
  }

  if (text === "1") {
    return INTERVIEW_TYPES.IN_PERSON;
  }

  if (text === "2") {
    return INTERVIEW_TYPES.ZOOM;
  }

  return null;
}

function evaluateInterviewTypeDecision({
  city,
  state = null,
  requestedType = null,
  currentType = null,
  message = ""
}) {
  const coverageDecision = evaluateCoverage({ city, state });
  const explicitRequest = requestedType || detectRequestedInterviewType(message);

  if (explicitRequest === INTERVIEW_TYPES.ZOOM && coverageDecision.coverage === COVERAGE.LOCAL) {
    return {
      interviewType: INTERVIEW_TYPES.ZOOM,
      allowed: true,
      needsHumanCoordinator: false,
      autoApplied: false,
      coverage: coverageDecision.coverage,
      reason: null
    };
  }

  if (
    explicitRequest === INTERVIEW_TYPES.IN_PERSON &&
    coverageDecision.coverage === COVERAGE.OUTSIDE
  ) {
    return {
      interviewType: coverageDecision.defaultInterviewType,
      allowed: false,
      needsHumanCoordinator: true,
      autoApplied: false,
      coverage: coverageDecision.coverage,
      reason: "Special meeting request"
    };
  }

  if (explicitRequest) {
    return {
      interviewType: explicitRequest,
      allowed: true,
      needsHumanCoordinator: false,
      autoApplied: false,
      coverage: coverageDecision.coverage,
      reason: null
    };
  }

  if (currentType) {
    return {
      interviewType: currentType,
      allowed: true,
      needsHumanCoordinator: false,
      autoApplied: false,
      coverage: coverageDecision.coverage,
      reason: null
    };
  }

  if (!city) {
    return {
      interviewType: null,
      allowed: false,
      needsHumanCoordinator: false,
      autoApplied: false,
      coverage: null,
      reason: null
    };
  }

  return {
    interviewType: coverageDecision.defaultInterviewType,
    allowed: true,
    needsHumanCoordinator: false,
    autoApplied: true,
    coverage: coverageDecision.coverage,
    messageKey: coverageDecision.messageKey,
    reason: null
  };
}

function isInterviewTypeChoiceRequired({ city, interviewType }) {
  if (!city || interviewType) {
    return false;
  }

  return false;
}

function evaluateSchedulingWindow({ hour, minute = 0 }) {
  const withinWindow = isWithinSchedulingWindow(hour, minute);

  return {
    withinWindow,
    needsHumanCoordinator: !withinWindow,
    humanReview: !withinWindow,
    reason: withinWindow ? null : "Outside scheduling window"
  };
}

function evaluateSameDayEligibility({ interviewType, hasCapacityToday }) {
  return {
    allowSameDay: interviewType === INTERVIEW_TYPES.ZOOM && Boolean(hasCapacityToday)
  };
}

function evaluateOccupationScheduling({ occupation = null, message = "" }) {
  if (isUnemployed(message, occupation)) {
    return {
      isWorking: false,
      periodStrategy: "ANY",
      allowAnySchedule: true
    };
  }

  const text = normalize(`${message} ${occupation || ""}`);
  const nonWorkingPatterns = [
    "student",
    "retired",
    "estudiante",
    "jubilado",
    "jubilada",
    "retirado",
    "retirada"
  ];

  if (nonWorkingPatterns.some((pattern) => text.includes(pattern))) {
    return {
      isWorking: false,
      periodStrategy: "ANY",
      allowAnySchedule: true
    };
  }

  const isWorking =
    Boolean(String(occupation || "").trim()) ||
    /\b(i work|trabajo|full[- ]time|tiempo completo)\b/.test(text);

  return {
    isWorking,
    periodStrategy: isWorking ? "PREFER_AFTER_FIVE" : "ANY",
    allowAnySchedule: !isWorking
  };
}

function evaluateSchedulingApproach({ city, state = null, occupation = null, message = "" }) {
  const coverageDecision = evaluateCoverage({ city, state });
  const occupationDecision = evaluateOccupationScheduling({ occupation, message });

  return {
    coverage: coverageDecision.coverage,
    messageKey: coverageDecision.messageKey,
    periodQuestionKey: occupationDecision.isWorking
      ? "BEFORE_AFTER_FIVE"
      : "MORNING_AFTERNOON",
    ...occupationDecision
  };
}

function evaluateHumanEscalation(flags = {}) {
  const needsHumanCoordinator = Boolean(
    flags.needsHumanCoordinator ||
      flags.humanReview ||
      flags.outsideInPersonRequest ||
      flags.outsideSchedulingWindow
  );

  return {
    needsHumanCoordinator,
    humanReview: needsHumanCoordinator,
    reason: flags.reason || null
  };
}

function evaluateWorkAuthorization(workStatus = "") {
  const normalizedStatus = normalize(workStatus);

  if (
    normalizedStatus.includes("citizen") ||
    normalizedStatus.includes("ciudadan") ||
    normalizedStatus.includes("resident") ||
    normalizedStatus.includes("residente") ||
    normalizedStatus.includes("valid permit") ||
    normalizedStatus.includes("permiso vigente")
  ) {
    return {
      qualified: true,
      humanReview: false,
      needsHumanCoordinator: false,
      reason: null
    };
  }

  if (
    normalizedStatus.includes("renewal") ||
    normalizedStatus.includes("renovacion") ||
    normalizedStatus.includes("renovación") ||
    normalizedStatus.includes("receipt") ||
    normalizedStatus.includes("recibo")
  ) {
    return {
      qualified: true,
      humanReview: true,
      needsHumanCoordinator: true,
      reason: "Verify work authorization during interview"
    };
  }

  return {
    qualified: false,
    humanReview: true,
    needsHumanCoordinator: true,
    reason: "Work authorization requires review"
  };
}

module.exports = {
  INTERVIEW_TYPES,
  COVERAGE,
  LOCAL_RADIUS_MILES,
  OFFICE_LOCATION,
  getOfficeLocation,
  evaluateCoverage,
  evaluateInterviewTypeDecision,
  isInterviewTypeChoiceRequired,
  evaluateSchedulingWindow,
  evaluateSameDayEligibility,
  evaluateOccupationScheduling,
  evaluateSchedulingApproach,
  evaluateHumanEscalation,
  evaluateWorkAuthorization,
  detectRequestedInterviewType,
  isLocalCity
};
