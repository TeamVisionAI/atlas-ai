/**
 * Recruit AI v2 — qualification fact separation (BR-083 / BR-089).
 * workAuthorization and financialLicense* are independent facts.
 * BR-089 — license requirement questions ≠ ambiguous license statements.
 */

const WORK_AUTHORIZATION = Object.freeze({
  AUTHORIZED: "authorized",
  NOT_AUTHORIZED: "not_authorized",
  PENDING_RENEWAL: "pending_renewal",
  UNCLEAR: "unclear",
  UNKNOWN: "unknown"
});

const FINANCIAL_LICENSE_STATUS = Object.freeze({
  NONE: "none",
  LICENSED: "licensed",
  IN_PROGRESS: "in_progress",
  EXPIRED: "expired",
  UNCLEAR: "unclear",
  UNKNOWN: "unknown"
});

const FINANCIAL_LICENSE_TYPES = Object.freeze({
  INSURANCE_LIFE: "insurance_life",
  FLORIDA_214: "florida_214",
  FLORIDA_215: "florida_215",
  SECURITIES_OR_INVESTMENT_REGISTRATION: "securities_or_investment_registration",
  OTHER_FINANCIAL: "other_financial",
  DRIVER: "driver",
  UNKNOWN: "unknown"
});

function normalizeAscii(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mentionsLicense(text) {
  return /\b(licen[cs]ia|license|licensed|licensing|214|215)\b/i.test(
    String(text || "")
  );
}

function mentionsWorkAuthorization(text) {
  return /\b(permiso( de trabajo)?|autorizacion|authorization|documentacion|documentation|papeles|work permit|authorized to work|green card|ciudadania|citizenship|residencia)\b/i.test(
    String(text || "")
  );
}

function looksLikeDriversLicense(text) {
  const t = normalizeAscii(text);
  return (
    /\b(driver'?s? license|drivers license|driving license|la de conducir|licencia de conducir|licencia de manejo)\b/.test(
      t
    ) ||
    /^(la de conducir|conducir|de conducir)([.!]?)?$/.test(t)
  );
}

function looksLikeFinancialLicense(text) {
  const t = normalizeAscii(text);
  if (looksLikeDriversLicense(t)) {
    return false;
  }
  return (
    /\b(licencia (de )?seguros|insurance license|financial(-| )services license|licencia profesional|tengo la 215|tengo la 214|florida 215|florida 214|life license)\b/.test(
      t
    ) || /\b(215|214)\b/.test(t)
  );
}

function looksLikeLicenseInProgress(text) {
  const t = normalizeAscii(text);
  return /\b(estoy sacando|estudiando para|studying for|getting my license|working on my license)\b/.test(
    t
  );
}

/**
 * BR-089 — "do I need a license?" style FAQ questions (not possession status).
 */
function looksLikeLicenseRequirementQuestion(text) {
  const raw = String(text || "").trim();
  const t = normalizeAscii(raw);
  if (!t || !mentionsLicense(raw)) {
    // Allow short "necesito una?" follow-ups without repeating "licencia".
    return /necesito una\??$/i.test(raw);
  }

  // Possession / absence statements are not requirement questions.
  if (
    /^(si[, ]*)?(tengo|i have) (una )?(licencia|license)\b/.test(t) ||
    /^(no tengo|i don'?t have|sin) (una )?(licencia|license)\b/.test(t)
  ) {
    return false;
  }

  // Path-detail asks (2-14/2-15 / which license) are handled separately (BR-089).
  if (/\b(2[- ]?14|2[- ]?15|214|215)\b/.test(t)) {
    return false;
  }

  return (
    /\b(tengo que tener|hay que tener|es obligatorio( tener)?|se necesita|necesito( una| estar)?|tengo que sacar|tengo que estar)\b/.test(
      t
    ) ||
    /\bnecesito licencia( para empezar)?\b/.test(t) ||
    /\blicencia para empezar\b/.test(t) ||
    /\bdo i need (a |to be )?licen/.test(t) ||
    /\bis (a )?license required\b/.test(t) ||
    /\bdo i have to get licen/.test(t) ||
    /\bis licensing mandatory\b/.test(t) ||
    /\bneed a license( to start)?\b/.test(t) ||
    /\bhace falta licencia\b/.test(t) ||
    /necesito una\??$/i.test(raw)
  );
}

function looksLikeLicenseAbsenceStatement(text) {
  const t = normalizeAscii(text);
  return (
    /\b(no tengo (una )?(licencia|license)|i don'?t have (a )?(licencia|license)|sin licencia|no license)\b/.test(
      t
    ) && !looksLikeLicenseRequirementQuestion(text)
  );
}

function looksLikeAmbiguousLicenseFragment(text) {
  const t = normalizeAscii(text);
  return (
    /^(la )?licen[cs]ia([.!]?)?$/.test(t) ||
    /^(the )?license( thing)?([.!]?)?$/.test(t) ||
    /^lo de la licencia/.test(t) ||
    /^sobre (la )?licen/.test(t)
  );
}

/**
 * Parse a license-related statement. Does NOT imply work authorization.
 * Requirement questions return null (handled as LICENSE_REQUIREMENT_QUESTION).
 */
function parseLicenseStatement(text) {
  const raw = String(text || "").trim();
  if (!raw || !mentionsLicense(raw)) {
    return null;
  }

  // BR-089 — requirement FAQ is not a possession/status statement.
  if (looksLikeLicenseRequirementQuestion(raw)) {
    return null;
  }

  if (looksLikeDriversLicense(raw)) {
    return {
      financialLicenseStatus: FINANCIAL_LICENSE_STATUS.NONE,
      financialLicenseTypes: [FINANCIAL_LICENSE_TYPES.DRIVER],
      ambiguous: false,
      driversLicense: true
    };
  }

  if (looksLikeLicenseInProgress(raw)) {
    return {
      financialLicenseStatus: FINANCIAL_LICENSE_STATUS.IN_PROGRESS,
      financialLicenseTypes: [FINANCIAL_LICENSE_TYPES.OTHER_FINANCIAL],
      ambiguous: false,
      driversLicense: false
    };
  }

  if (looksLikeFinancialLicense(raw)) {
    const types = [];
    const t = normalizeAscii(raw);
    if (/\b215\b/.test(t)) {
      types.push(FINANCIAL_LICENSE_TYPES.FLORIDA_215);
    }
    if (/\b214\b/.test(t)) {
      types.push(FINANCIAL_LICENSE_TYPES.FLORIDA_214);
    }
    if (/\bseguro|insurance|life\b/.test(t)) {
      types.push(FINANCIAL_LICENSE_TYPES.INSURANCE_LIFE);
    }
    if (!types.length) {
      types.push(FINANCIAL_LICENSE_TYPES.OTHER_FINANCIAL);
    }
    return {
      financialLicenseStatus: FINANCIAL_LICENSE_STATUS.LICENSED,
      financialLicenseTypes: types,
      ambiguous: false,
      driversLicense: false
    };
  }

  // BR-089 — clear absence is a status statement, not type-ambiguity.
  if (looksLikeLicenseAbsenceStatement(raw)) {
    return {
      financialLicenseStatus: FINANCIAL_LICENSE_STATUS.NONE,
      financialLicenseTypes: [],
      ambiguous: false,
      driversLicense: false
    };
  }

  // Bare / fragmentary license mentions stay ambiguous (BR-083/089).
  if (looksLikeAmbiguousLicenseFragment(raw)) {
    return {
      financialLicenseStatus: FINANCIAL_LICENSE_STATUS.UNCLEAR,
      financialLicenseTypes: [FINANCIAL_LICENSE_TYPES.UNKNOWN],
      ambiguous: true,
      driversLicense: false
    };
  }

  // Generic "tengo licencia" / "I have a license" — type unclear.
  return {
    financialLicenseStatus: FINANCIAL_LICENSE_STATUS.UNCLEAR,
    financialLicenseTypes: [FINANCIAL_LICENSE_TYPES.UNKNOWN],
    ambiguous: true,
    driversLicense: false
  };
}

/**
 * Work-authorization answer that is NOT contaminated by license-only wording.
 */
function parseWorkAuthorizationAnswer(text, context = {}) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  const t = normalizeAscii(raw);
  const pendingAuth =
    String(context?.conversation?.lastQuestionAsked || "") === "ask_authorization";

  // License-only answers never satisfy work authorization (BR-083).
  if (mentionsLicense(raw) && !mentionsWorkAuthorization(raw)) {
    return null;
  }

  const yesAuth =
    /^(si|yes|yep|yeah)\b/.test(t) && mentionsWorkAuthorization(raw);
  const yesShort =
    pendingAuth &&
    !mentionsLicense(raw) &&
    (/^(si|yes|yep|yeah|claro|por supuesto)([.!]?)$/i.test(raw.trim()) ||
      (/^(si|yes).{0,40}\b(tengo|have|cuento con)\b/i.test(raw) &&
        mentionsWorkAuthorization(raw)));
  const patternYes =
    mentionsWorkAuthorization(raw) &&
    !/\b(no|not|sin)\b/.test(t) &&
    !mentionsLicense(raw);

  if (yesAuth || yesShort || patternYes) {
    return WORK_AUTHORIZATION.AUTHORIZED;
  }

  const noAuth =
    pendingAuth &&
    (/^(no|nope)([.!]?)$/i.test(raw.trim()) ||
      /\b(no tengo permiso|not authorized|sin permiso|sin papeles)\b/.test(t));
  if (noAuth) {
    return WORK_AUTHORIZATION.NOT_AUTHORIZED;
  }

  return null;
}

function toBooleanWorkAuthorization(status) {
  if (status === WORK_AUTHORIZATION.AUTHORIZED) {
    return true;
  }
  if (status === WORK_AUTHORIZATION.NOT_AUTHORIZED) {
    return false;
  }
  return null;
}

module.exports = {
  WORK_AUTHORIZATION,
  FINANCIAL_LICENSE_STATUS,
  FINANCIAL_LICENSE_TYPES,
  mentionsLicense,
  mentionsWorkAuthorization,
  looksLikeDriversLicense,
  looksLikeFinancialLicense,
  looksLikeLicenseRequirementQuestion,
  looksLikeLicenseAbsenceStatement,
  looksLikeAmbiguousLicenseFragment,
  parseLicenseStatement,
  parseWorkAuthorizationAnswer,
  toBooleanWorkAuthorization
};
