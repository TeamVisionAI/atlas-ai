/**
 * BR-157 — IUL button-first qualification IDs and labels.
 * Business logic branches on IDs, never display copy.
 */

const {
  buildInteractiveFromOptions,
  formatNumberedFallback,
  parseNumericFallback
} = require("../whatsappInteractiveMessage");

const IUL_OPTION_IDS = Object.freeze({
  STATUS_ACTIVE: "IUL_STATUS_ACTIVE",
  STATUS_RESEARCH: "IUL_STATUS_RESEARCH",
  STATUS_UNSURE: "IUL_STATUS_UNSURE",
  REVIEW_COSTS: "IUL_REVIEW_COSTS",
  REVIEW_GROWTH: "IUL_REVIEW_GROWTH",
  REVIEW_BENEFITS: "IUL_REVIEW_BENEFITS",
  REVIEW_UNDERSTAND: "IUL_REVIEW_UNDERSTAND",
  REVIEW_OTHER: "IUL_REVIEW_OTHER",
  REVIEW_HOW: "IUL_REVIEW_HOW",
  POLICY_IN_HAND_YES: "IUL_POLICY_IN_HAND_YES",
  POLICY_IN_HAND_NO: "IUL_POLICY_IN_HAND_NO",
  DAY_MORNING: "IUL_DAY_MORNING",
  DAY_AFTERNOON: "IUL_DAY_AFTERNOON",
  MEET_ZOOM: "IUL_MEET_ZOOM",
  MEET_OFFICE: "IUL_MEET_OFFICE"
});

const IUL_OPTION_LABELS = Object.freeze({
  [IUL_OPTION_IDS.STATUS_ACTIVE]: "Tengo un IUL activo",
  [IUL_OPTION_IDS.STATUS_RESEARCH]: "Estoy buscando información",
  [IUL_OPTION_IDS.STATUS_UNSURE]: "No estoy seguro qué tengo",
  [IUL_OPTION_IDS.REVIEW_COSTS]: "Costos",
  [IUL_OPTION_IDS.REVIEW_GROWTH]: "Crecimiento",
  [IUL_OPTION_IDS.REVIEW_BENEFITS]: "Beneficios",
  [IUL_OPTION_IDS.REVIEW_UNDERSTAND]: "Entender mi póliza",
  [IUL_OPTION_IDS.REVIEW_OTHER]: "Otro",
  [IUL_OPTION_IDS.REVIEW_HOW]: "Cómo funciona",
  [IUL_OPTION_IDS.POLICY_IN_HAND_YES]: "Tengo la póliza",
  [IUL_OPTION_IDS.POLICY_IN_HAND_NO]: "No la tengo a mano",
  [IUL_OPTION_IDS.DAY_MORNING]: "En la mañana",
  [IUL_OPTION_IDS.DAY_AFTERNOON]: "En la tarde",
  [IUL_OPTION_IDS.MEET_ZOOM]: "Por Zoom",
  [IUL_OPTION_IDS.MEET_OFFICE]: "En la oficina"
});

/** Titles that fit Meta reply-button 20-char limit. */
const IUL_BUTTON_TITLES = Object.freeze({
  [IUL_OPTION_IDS.STATUS_ACTIVE]: "Tengo un IUL activo",
  [IUL_OPTION_IDS.STATUS_RESEARCH]: "Busco información",
  [IUL_OPTION_IDS.STATUS_UNSURE]: "No estoy seguro",
  [IUL_OPTION_IDS.REVIEW_COSTS]: "Costos",
  [IUL_OPTION_IDS.REVIEW_GROWTH]: "Crecimiento",
  [IUL_OPTION_IDS.REVIEW_BENEFITS]: "Beneficios",
  [IUL_OPTION_IDS.REVIEW_UNDERSTAND]: "Entender mi póliza",
  [IUL_OPTION_IDS.REVIEW_OTHER]: "Otro",
  [IUL_OPTION_IDS.REVIEW_HOW]: "Cómo funciona",
  [IUL_OPTION_IDS.POLICY_IN_HAND_YES]: "Tengo la póliza",
  [IUL_OPTION_IDS.POLICY_IN_HAND_NO]: "No la tengo a mano",
  [IUL_OPTION_IDS.DAY_MORNING]: "En la mañana",
  [IUL_OPTION_IDS.DAY_AFTERNOON]: "En la tarde",
  [IUL_OPTION_IDS.MEET_ZOOM]: "Por Zoom",
  [IUL_OPTION_IDS.MEET_OFFICE]: "En la oficina"
});

function option(id) {
  return {
    id,
    title: IUL_BUTTON_TITLES[id],
    label: IUL_OPTION_LABELS[id],
    description: IUL_OPTION_LABELS[id]
  };
}

const STATUS_OPTIONS = Object.freeze([
  option(IUL_OPTION_IDS.STATUS_ACTIVE),
  option(IUL_OPTION_IDS.STATUS_RESEARCH),
  option(IUL_OPTION_IDS.STATUS_UNSURE)
]);

const REVIEW_INTENT_OPTIONS = Object.freeze([
  option(IUL_OPTION_IDS.REVIEW_COSTS),
  option(IUL_OPTION_IDS.REVIEW_GROWTH),
  option(IUL_OPTION_IDS.REVIEW_BENEFITS),
  option(IUL_OPTION_IDS.REVIEW_UNDERSTAND),
  option(IUL_OPTION_IDS.REVIEW_OTHER)
]);

const RESEARCH_INTENT_OPTIONS = Object.freeze([
  option(IUL_OPTION_IDS.REVIEW_HOW),
  option(IUL_OPTION_IDS.REVIEW_COSTS),
  option(IUL_OPTION_IDS.REVIEW_GROWTH),
  option(IUL_OPTION_IDS.REVIEW_BENEFITS),
  option(IUL_OPTION_IDS.REVIEW_OTHER)
]);

const POLICY_IN_HAND_OPTIONS = Object.freeze([
  option(IUL_OPTION_IDS.POLICY_IN_HAND_YES),
  option(IUL_OPTION_IDS.POLICY_IN_HAND_NO)
]);

const DAY_PART_OPTIONS = Object.freeze([
  option(IUL_OPTION_IDS.DAY_MORNING),
  option(IUL_OPTION_IDS.DAY_AFTERNOON)
]);

const MEETING_MODE_OPTIONS = Object.freeze([
  option(IUL_OPTION_IDS.MEET_ZOOM),
  option(IUL_OPTION_IDS.MEET_OFFICE)
]);

const CATALOGS = Object.freeze({
  status: STATUS_OPTIONS,
  reviewIntent: REVIEW_INTENT_OPTIONS,
  researchIntent: RESEARCH_INTENT_OPTIONS,
  policyInHand: POLICY_IN_HAND_OPTIONS,
  dayPart: DAY_PART_OPTIONS,
  meetingMode: MEETING_MODE_OPTIONS
});

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveIulOption(catalog, { id = null, title = null, text = null } = {}) {
  const options = CATALOGS[catalog] || [];
  const rawId = String(id || "").trim();
  if (rawId) {
    const byId = options.find((row) => row.id === rawId);
    if (byId) {
      return byId;
    }
  }

  const numeric = parseNumericFallback(text, options);
  if (numeric) {
    return numeric;
  }

  const folded = fold(title || text);
  if (!folded) {
    return null;
  }

  return (
    options.find((row) => fold(row.id) === folded) ||
    options.find((row) => fold(row.label) === folded) ||
    options.find((row) => fold(row.title) === folded) ||
    options.find((row) => {
      if (folded.length < 3) {
        return false;
      }
      const label = fold(row.label);
      const title = fold(row.title);
      return folded.includes(label) || label.includes(folded) || folded.includes(title) || title.includes(folded);
    }) ||
    null
  );
}

function historyLabelForId(id, fallbackTitle = null) {
  return IUL_OPTION_LABELS[id] || fallbackTitle || id || null;
}

function buildIulInteractive(catalog, body) {
  const options = CATALOGS[catalog] || [];
  return {
    interactive: buildInteractiveFromOptions({
      body,
      options,
      listButtonText: "Ver opciones",
      listSectionTitle: "Opciones"
    }),
    fallbackText: formatNumberedFallback(body, options),
    options
  };
}

module.exports = {
  IUL_OPTION_IDS,
  IUL_OPTION_LABELS,
  IUL_BUTTON_TITLES,
  STATUS_OPTIONS,
  REVIEW_INTENT_OPTIONS,
  RESEARCH_INTENT_OPTIONS,
  POLICY_IN_HAND_OPTIONS,
  DAY_PART_OPTIONS,
  MEETING_MODE_OPTIONS,
  resolveIulOption,
  historyLabelForId,
  buildIulInteractive
};
