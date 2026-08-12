/**
 * Recruit AI v2 — qualification fact separation (BR-083 / BR-089 / BR-090 / BR-096).
 * workAuthorization and financialLicense* are independent facts.
 * BR-089 — license requirement questions ≠ ambiguous license statements.
 * BR-090 — explicit Puerto Rico origin statements satisfy work authorization.
 * BR-096 — pending-auth status shorthand (residente / ciudadano) satisfies work auth.
 * BR-100 — affirmative discourse prefixes (sí/si/yes/claro) before BR-096 status still authorize.
 */

const {
  looksLikePuertoRicoOriginStatement
} = require("./employmentFit");

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

  // Implements BR-090 — explicit Puerto Rico origin/citizenship is sufficient.
  if (looksLikePuertoRicoOriginStatement(raw)) {
    const alreadyAuthorized =
      context?.knownFacts?.workAuthorizationStatus ===
        WORK_AUTHORIZATION.AUTHORIZED ||
      context?.knownFacts?.workAuthorization === true;
    if (alreadyAuthorized) {
      return null;
    }
    const lastQ = String(context?.conversation?.lastQuestionAsked || "");
    const locationPending = /^(ask_location|confirm_location|ask_state|ask_city)$/.test(
      lastQ
    );
    // Do not steal an active location turn unless auth was the pending ask.
    if (locationPending && !pendingAuth) {
      return null;
    }
    return WORK_AUTHORIZATION.AUTHORIZED;
  }

  // Negatives first while auth is pending — including mixed "sí, pero no tengo…".
  // Superficial affirmative tokens must never override negative meaning (BR-100).
  const noAuth =
    pendingAuth &&
    (/^(no|nope)([.!]?)$/i.test(raw.trim()) ||
      /\b(no tengo (permiso|papeles)|todavia no tengo permiso|estoy esperando( el)? permiso|sin permiso|sin papeles)\b/.test(
        t
      ) ||
      /\b(i don'?t have (a )?work permit|i am not authorized to work( yet)?|i'?m not authorized to work( yet)?|not authorized( to work)?( yet)?)\b/.test(
        t
      ) ||
      /\b(pero )?(no tengo|todavia no|estoy esperando)\b/.test(t) &&
        /\b(permiso|papeles|autoriz)\b/.test(t) ||
      /\b(but )?(i'?m |i am )?not authorized\b/.test(t));
  if (noAuth) {
    return WORK_AUTHORIZATION.NOT_AUTHORIZED;
  }

  // Implements BR-096 / BR-100 — status / birthplace shorthand while ask_authorization
  // is pending. Optional affirmative discourse prefix (sí/si/claro/yes) is ignored for
  // matching so "si soy ciudadano" never falls through to schedule_confirm/handoff.
  // Compound mid-flow utterances ("Soy ciudadana dime como es el trabajo") require an
  // explicit soy / I'm-a clause so bare "ciudadano/residente" mid-sentence never authorizes.
  const affirmPrefix = "((si|claro|correcto|por supuesto|yes|yeah|yep)[,:]?\\s+)?";
  const statusNounEs =
    "(residente( permanente)?|ciudadan[oa]( americano| americana)?)";
  const statusNounEn =
    "((permanent )?resident|(us |u\\.s\\.? |american )?citizen)";
  const pendingStatusShorthand =
    pendingAuth &&
    !mentionsLicense(raw) &&
    (new RegExp(
      `^${affirmPrefix}(soy )?${statusNounEs}([.!]?)?$`
    ).test(t) ||
      new RegExp(
        `^${affirmPrefix}(i'?m a |i am a )?${statusNounEn}([.!]?)?$`
      ).test(t) ||
      // Same-turn compound: require soy / I'm a … as a leading clause.
      new RegExp(`^${affirmPrefix}soy ${statusNounEs}\\b`).test(t) ||
      new RegExp(
        `^${affirmPrefix}(i'?m a |i am a )${statusNounEn}\\b`
      ).test(t));

  // Birthplace affirmatives (EN/ES) — not a location correction when auth is pending.
  const pendingBornHereAffirmative =
    pendingAuth &&
    !mentionsLicense(raw) &&
    (new RegExp(
      `^${affirmPrefix}(yo )?(naci|nacio) (aqui|en (estados unidos|ee\\.? ?uu\\.?|usa|us|eeuu))([.!]?)?$`
    ).test(t) ||
      new RegExp(
        `^${affirmPrefix}(i )?(was )?born (here|in the (us|u\\.s\\.?|usa|united states))([.!]?)?$`
      ).test(t) ||
      new RegExp(`^${affirmPrefix}born here([.!]?)?$`).test(t));

  const yesAuth =
    /^(si|yes|yep|yeah)\b/.test(t) && mentionsWorkAuthorization(raw);
  // Pending ask_authorization only: "si tengo" / "sí tengo" means yes to the
  // work-permit question just asked — do not invent auth without that context.
  const yesTengoShorthand =
    pendingAuth &&
    !mentionsLicense(raw) &&
    /^(si|yes|yep|yeah)[,:]?\s+(tengo|have)([.!]?)?$/i.test(raw.trim());
  const yesShort =
    pendingAuth &&
    !mentionsLicense(raw) &&
    (/^(si|yes|yep|yeah|claro|por supuesto)([.!]?)$/i.test(raw.trim()) ||
      yesTengoShorthand ||
      (/^(si|yes).{0,40}\b(tengo|have|cuento con)\b/i.test(raw) &&
        mentionsWorkAuthorization(raw)));
  const patternYes =
    mentionsWorkAuthorization(raw) &&
    !/\b(no|not|sin|esperando|todavia)\b/.test(t) &&
    !mentionsLicense(raw);

  if (
    pendingStatusShorthand ||
    pendingBornHereAffirmative ||
    yesAuth ||
    yesShort ||
    patternYes
  ) {
    return WORK_AUTHORIZATION.AUTHORIZED;
  }

  // "tengo visa" / bare visa mentions intentionally fall through (null) so existing
  // clarification behavior can run — never auto-satisfy work authorization.

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
  toBooleanWorkAuthorization,
  looksLikePuertoRicoOriginStatement
};
