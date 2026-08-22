/**
 * BR-147 — Campaign Intake Code constants.
 */

const INTAKE_CODE_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  RETIRED: "RETIRED"
});

const INTAKE_CODE_PURPOSE = Object.freeze({
  RECRUITING: "RECRUITING",
  IUL: "IUL",
  OTHER: "OTHER"
});

const PURPOSE_PREFIX = Object.freeze({
  [INTAKE_CODE_PURPOSE.RECRUITING]: "TVR",
  [INTAKE_CODE_PURPOSE.IUL]: "TVI",
  [INTAKE_CODE_PURPOSE.OTHER]: "TVO"
});

const INTAKE_CODE_PATTERN = /\b(TV[RIO]-\d{4}-[A-Z0-9]{4})\b/i;

module.exports = {
  INTAKE_CODE_STATUS,
  INTAKE_CODE_PURPOSE,
  PURPOSE_PREFIX,
  INTAKE_CODE_PATTERN
};
