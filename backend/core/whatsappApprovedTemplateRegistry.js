/**
 * BR-075 / BR-078 — Approved Meta WhatsApp template registry.
 * Internal copy templates are NOT Meta-approved templates.
 * Only registry entries marked approved + active with an explicit metaTemplateName
 * may send outside the customer-care window.
 *
 * Phase 1: catalog contracts + mappings are code-ready; all locales remain inactive
 * until WHATSAPP_APPROVED_TEMPLATES_JSON is explicitly authorized after Meta approval.
 */

const {
  normalizePreferredLanguage,
  DEFAULT_PREFERRED_LANGUAGE
} = require("./prospectLanguage");
const {
  normalizeZoomDynamicUrlButtonParameter
} = require("./whatsappTemplateVariableBuilder");

const TEMPLATE_LOCALES = Object.freeze(["english", "spanish"]);

const ZOOM_URL_DELIVERY_MODES = Object.freeze({
  DYNAMIC_URL_BUTTON: "dynamic_url_button",
  BODY_VARIABLE: "body_variable"
});

/**
 * Canonical Meta Cloud API template names for approved/active Team Vision templates.
 * Documentation + ops contract only — does not activate sending by itself.
 * Implements BR-078 mapping audit (2026-08-07).
 */
const CANONICAL_META_TEMPLATE_NAMES = Object.freeze({
  interview_reminder: Object.freeze({
    english: "atlas_interview_reminder_en",
    spanish: "atlas_interview_reminder_es"
  }),
  interview_confirmation: Object.freeze({
    english: "atlas_interview_confirmation_en",
    spanish: "atlas_interview_confirmation_es"
  }),
  interview_details: Object.freeze({
    english: "atlas_interview_details_en",
    spanish: "atlas_interview_details_es"
  }),
  missed_appointment: Object.freeze({
    english: "atlas_missed_appointment_en",
    // Canonical Spanish missed-appointment template — never atlas_missed_appointment_es.
    spanish: "atlas_missed_appointment_es_v2"
  }),
  zoom_invitation: Object.freeze({
    english: "atlas_zoom_invitation_en",
    spanish: "atlas_zoom_invitation_es"
  }),
  office_location: Object.freeze({
    english: "atlas_office_location_en",
    spanish: "atlas_office_location_es"
  }),
  human_assist_notice: Object.freeze({
    english: "atlas_human_assist_notice_en",
    spanish: "atlas_human_assist_notice_es"
  }),
  lead_welcome: Object.freeze({
    english: "atlas_lead_welcome_en",
    spanish: "atlas_lead_welcome_es"
  }),
  follow_up: Object.freeze({
    english: "atlas_follow_up_en",
    spanish: "atlas_follow_up_es"
  })
});

/** Superseded Meta names — must never activate. */
const STALE_META_TEMPLATE_NAMES = Object.freeze(["atlas_missed_appointment_es"]);

function getCanonicalMetaTemplateName(registryKey, locale) {
  const entry = CANONICAL_META_TEMPLATE_NAMES[registryKey];
  if (!entry) {
    return null;
  }
  return entry[locale] || null;
}

function isStaleMetaTemplateName(metaTemplateName) {
  const name = String(metaTemplateName || "").trim();
  return Boolean(name) && STALE_META_TEMPLATE_NAMES.includes(name);
}

function localeStub(languageCode) {
  return Object.freeze({
    languageCode,
    metaTemplateName: null,
    approved: false,
    active: false
  });
}

function dualLocales() {
  return Object.freeze({
    english: localeStub("en"),
    spanish: localeStub("es")
  });
}

/**
 * Canonical BR-078 registry.
 * metaTemplateName remains null until operational configuration activates entries.
 */
const BASE_REGISTRY = Object.freeze({
  lead_welcome: Object.freeze({
    key: "lead_welcome",
    category: "marketing",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze(["FACEBOOK_LEAD_WELCOME", "LEAD_WELCOME"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  }),
  interview_confirmation: Object.freeze({
    key: "interview_confirmation",
    category: "utility",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze(["APPOINTMENT_CONFIRMATION", "SCHEDULE_CONFIRMATION"]),
    expectedVariableKeys: Object.freeze([
      "prospect_first_name",
      "interview_when",
      "meeting_type",
      "meeting_location"
    ]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  }),
  interview_reminder: Object.freeze({
    key: "interview_reminder",
    category: "utility",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze([
      "APPOINTMENT_REMINDER",
      "send_interview_reminder",
      "REMINDER_24H",
      "REMINDER_1H",
      "REMINDER_15M"
    ]),
    expectedVariableKeys: Object.freeze([
      "prospect_first_name",
      "interview_when",
      "meeting_type"
    ]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  }),
  interview_details: Object.freeze({
    key: "interview_details",
    category: "utility",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze(["INTERVIEW_DETAILS", "RESCHEDULE_CONFIRMATION"]),
    expectedVariableKeys: Object.freeze([
      "prospect_first_name",
      "interview_when",
      "meeting_type",
      "meeting_location"
    ]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  }),
  missed_appointment: Object.freeze({
    key: "missed_appointment",
    category: "utility",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze([
      "MISSED_APPOINTMENT",
      "send_missed_appointment",
      "AGENT_MISSED_APPOINTMENT"
    ]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  }),
  zoom_invitation: Object.freeze({
    key: "zoom_invitation",
    category: "utility",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze(["SEND_ZOOM_LINK", "ZOOM_INVITATION"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    expectedButtonVariableKeys: Object.freeze(["meeting_url"]),
    zoomUrlDeliveryMode: ZOOM_URL_DELIVERY_MODES.DYNAMIC_URL_BUTTON,
    locales: dualLocales()
  }),
  office_location: Object.freeze({
    key: "office_location",
    category: "utility",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze(["SEND_OFFICE_LOCATION", "OFFICE_LOCATION"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name", "meeting_address"]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  }),
  human_assist_notice: Object.freeze({
    key: "human_assist_notice",
    category: "utility",
    status: "draft",
    version: "1",
    sendable: true,
    intents: Object.freeze(["HUMAN_ASSIST", "HANDOFF", "HUMAN_ASSIST_NOTICE"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  }),
  follow_up: Object.freeze({
    key: "follow_up",
    category: "pending_classification",
    status: "draft_pending_classification",
    version: "1",
    sendable: false,
    intents: Object.freeze(["FOLLOW_UP", "NO_RESPONSE_FOLLOW_UP", "WHATSAPP_FOLLOW_UP"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    expectedButtonVariableKeys: Object.freeze([]),
    zoomUrlDeliveryMode: null,
    locales: dualLocales()
  })
});

const INTENT_TO_KEY = Object.freeze(
  Object.values(BASE_REGISTRY).reduce((acc, entry) => {
    entry.intents.forEach((intent) => {
      acc[intent] = entry.key;
    });
    return acc;
  }, {})
);

function deepCloneRegistry() {
  return JSON.parse(JSON.stringify(BASE_REGISTRY));
}

function parseApprovedTemplatesEnv(raw = process.env.WHATSAPP_APPROVED_TEMPLATES_JSON) {
  if (!raw || !String(raw).trim()) {
    return { overrides: {}, parseError: false, unknownKeys: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { overrides: {}, parseError: true, unknownKeys: [] };
    }

    return { overrides: parsed, parseError: false, unknownKeys: [] };
  } catch {
    console.warn(
      "[whatsappApprovedTemplateRegistry] WHATSAPP_APPROVED_TEMPLATES_JSON is malformed; using inactive fail-closed registry"
    );
    return { overrides: {}, parseError: true, unknownKeys: [] };
  }
}

function applyOperationalOverrides(registry, parsed = {}) {
  const diagnostics = {
    parseError: Boolean(parsed.parseError),
    unknownKeys: [],
    invalidLocales: [],
    templateSendingDisabled: Boolean(parsed.parseError)
  };

  if (parsed.parseError) {
    registry.__diagnostics = diagnostics;
    return registry;
  }

  const overrides = parsed.overrides || parsed;

  Object.entries(overrides).forEach(([key, localeMap]) => {
    if (key.startsWith("__")) {
      return;
    }

    if (!registry[key]) {
      diagnostics.unknownKeys.push(key);
      console.warn(
        `[whatsappApprovedTemplateRegistry] unknown template key rejected: ${key}`
      );
      return;
    }

    if (!localeMap || typeof localeMap !== "object") {
      return;
    }

    if (localeMap.category && typeof localeMap.category === "string") {
      // Category overrides are documentation/ops hints only for known marketing/utility;
      // pending_classification cannot be overridden to a sendable category via env.
      if (registry[key].category !== "pending_classification") {
        registry[key].category = localeMap.category;
      }
    }

    if (localeMap.version != null) {
      registry[key].version = String(localeMap.version);
    }

    if (localeMap.zoomUrlDeliveryMode === ZOOM_URL_DELIVERY_MODES.BODY_VARIABLE) {
      // Documented fallback mode — disabled by default; enable only via explicit config.
      registry[key].zoomUrlDeliveryMode = ZOOM_URL_DELIVERY_MODES.BODY_VARIABLE;
      registry[key].expectedVariableKeys = [
        "prospect_first_name",
        "meeting_url"
      ];
      registry[key].expectedButtonVariableKeys = [];
    }

    TEMPLATE_LOCALES.forEach((locale) => {
      const override = localeMap[locale];

      if (!override || typeof override !== "object") {
        return;
      }

      const metaTemplateName =
        typeof override.metaTemplateName === "string" && override.metaTemplateName.trim()
          ? override.metaTemplateName.trim()
          : null;

      const wantsApproved = Boolean(override.approved);
      const wantsActive = Boolean(override.active);

      if ((wantsApproved || wantsActive) && !metaTemplateName) {
        diagnostics.invalidLocales.push({
          key,
          locale,
          reason: "APPROVED_OR_ACTIVE_WITHOUT_META_NAME"
        });
      }

      if (wantsActive && !wantsApproved) {
        diagnostics.invalidLocales.push({
          key,
          locale,
          reason: "ACTIVE_WITHOUT_APPROVED"
        });
      }

      // Fail closed: never activate superseded Meta names (e.g. atlas_missed_appointment_es).
      if (metaTemplateName && isStaleMetaTemplateName(metaTemplateName)) {
        diagnostics.invalidLocales.push({
          key,
          locale,
          reason: "STALE_META_TEMPLATE_NAME",
          metaTemplateName
        });
        console.warn(
          `[whatsappApprovedTemplateRegistry] stale Meta template rejected: ${metaTemplateName} (${key}/${locale})`
        );
        registry[key].locales[locale] = {
          ...registry[key].locales[locale],
          metaTemplateName: null,
          approved: false,
          active: false
        };
        return;
      }

      const approved = wantsApproved && Boolean(metaTemplateName);
      const active = wantsActive && approved && Boolean(metaTemplateName);

      registry[key].locales[locale] = {
        ...registry[key].locales[locale],
        metaTemplateName,
        approved,
        active,
        languageCode:
          typeof override.languageCode === "string" && override.languageCode.trim()
            ? override.languageCode.trim()
            : registry[key].locales[locale].languageCode
      };
    });
  });

  registry.__diagnostics = diagnostics;
  return registry;
}

function getApprovedTemplateRegistry(envRaw) {
  return applyOperationalOverrides(deepCloneRegistry(), parseApprovedTemplatesEnv(envRaw));
}

function getTemplateRegistryHealth(registry = getApprovedTemplateRegistry()) {
  const diagnostics = registry.__diagnostics || {
    parseError: false,
    unknownKeys: [],
    invalidLocales: [],
    templateSendingDisabled: false
  };

  const degraded =
    diagnostics.parseError ||
    diagnostics.unknownKeys.length > 0 ||
    diagnostics.invalidLocales.length > 0;

  return {
    id: "whatsapp_approved_templates",
    label: "WhatsApp approved template catalog (BR-078)",
    ok: !diagnostics.parseError,
    blocker: false,
    degraded,
    detail: diagnostics.parseError
      ? "WHATSAPP_APPROVED_TEMPLATES_JSON malformed; template sending fail-closed"
      : diagnostics.unknownKeys.length
        ? `unknown keys rejected: ${diagnostics.unknownKeys.join(", ")}`
        : diagnostics.invalidLocales.length
          ? "invalid approved/active locale entries ignored for sendability"
          : "registry loaded; templates inactive until Meta approval + env authorization",
    diagnostics: {
      parseError: diagnostics.parseError,
      unknownKeyCount: diagnostics.unknownKeys.length,
      invalidLocaleCount: diagnostics.invalidLocales.length,
      templateSendingDisabled: Boolean(diagnostics.templateSendingDisabled)
    }
  };
}

function listRegistryKeys(registry = getApprovedTemplateRegistry()) {
  return Object.keys(registry).filter((key) => !key.startsWith("__"));
}

function resolveTemplateLanguage(prospect = {}) {
  const preferred = normalizePreferredLanguage((prospect || {}).preferred_language);

  if (preferred) {
    return preferred;
  }

  return DEFAULT_PREFERRED_LANGUAGE;
}

function resolveRegistryKeyForIntent(intent, explicitKey = null, registry = getApprovedTemplateRegistry()) {
  if (explicitKey) {
    if (!registry[explicitKey] || String(explicitKey).startsWith("__")) {
      return { ok: false, code: "UNKNOWN_TEMPLATE_KEY", key: null };
    }

    return { ok: true, key: explicitKey };
  }

  // Ambiguous legacy alias — must never resolve to interview_reminder.
  if (String(intent || "") === "CONFIRMATION") {
    return { ok: false, code: "AMBIGUOUS_CONFIRMATION_INTENT", key: null };
  }

  const mapped = INTENT_TO_KEY[intent];

  if (!mapped || !registry[mapped]) {
    return { ok: false, code: "NO_TEMPLATE_FOR_INTENT", key: null };
  }

  return { ok: true, key: mapped };
}

function validateOrderedVariables(expectedKeys = [], variables = {}) {
  const providedKeys = Object.keys(variables || {});
  const missing = expectedKeys.filter((key) => {
    const value = variables[key];
    return value == null || String(value).trim() === "";
  });

  if (missing.length) {
    return {
      ok: false,
      reason: "TEMPLATE_VARIABLES_INVALID",
      missingVariables: missing,
      providedVariableKeys: providedKeys
    };
  }

  const unexpected = providedKeys.filter((key) => !expectedKeys.includes(key));

  if (unexpected.length) {
    return {
      ok: false,
      reason: "TEMPLATE_VARIABLE_ORDER_OR_KEYS_INVALID",
      missingVariables: [],
      providedVariableKeys: providedKeys,
      unexpectedVariableKeys: unexpected
    };
  }

  if (providedKeys.length !== expectedKeys.length) {
    return {
      ok: false,
      reason: "TEMPLATE_VARIABLE_COUNT_INVALID",
      missingVariables: [],
      providedVariableKeys: providedKeys
    };
  }

  // Enforce contract order: callers should supply keys in contract order.
  for (let i = 0; i < expectedKeys.length; i += 1) {
    if (providedKeys[i] !== expectedKeys[i]) {
      return {
        ok: false,
        reason: "TEMPLATE_VARIABLE_ORDER_INVALID",
        missingVariables: [],
        providedVariableKeys: providedKeys,
        expectedVariableKeys: expectedKeys
      };
    }
  }

  return { ok: true, providedVariableKeys: providedKeys };
}

function resolveBodyAndButtonKeys(entry) {
  const bodyKeys = [...(entry.expectedVariableKeys || [])];
  const buttonKeys = [...(entry.expectedButtonVariableKeys || [])];
  return { bodyKeys, buttonKeys };
}

function resolveApprovedTemplate({
  intent,
  templateKey = null,
  prospect = {},
  variables = {},
  buttonVariables = {},
  callerMetaTemplateName = null,
  registry = getApprovedTemplateRegistry()
} = {}) {
  if (registry.__diagnostics?.templateSendingDisabled) {
    return {
      ok: false,
      status: "blocked_template_missing",
      reason: "TEMPLATE_REGISTRY_CONFIG_INVALID",
      templateKey: templateKey || null,
      metaTemplateName: null,
      language: resolveTemplateLanguage(prospect),
      languageCode: null
    };
  }

  if (callerMetaTemplateName) {
    return {
      ok: false,
      status: "blocked_template_unapproved",
      reason: "CALLER_META_TEMPLATE_NAME_REJECTED",
      templateKey: null,
      metaTemplateName: null,
      language: resolveTemplateLanguage(prospect),
      languageCode: null
    };
  }

  const keyResult = resolveRegistryKeyForIntent(intent, templateKey, registry);

  if (!keyResult.ok) {
    return {
      ok: false,
      status: "blocked_template_missing",
      reason: keyResult.code,
      templateKey: templateKey || null,
      metaTemplateName: null,
      language: resolveTemplateLanguage(prospect),
      languageCode: null
    };
  }

  const entry = registry[keyResult.key];
  const language = resolveTemplateLanguage(prospect);
  const locale = entry.locales[language];

  if (entry.category === "pending_classification" || entry.sendable === false) {
    return {
      ok: false,
      status: "blocked_template_unapproved",
      reason: "UNSUPPORTED_OR_PENDING_CATEGORY",
      templateKey: entry.key,
      metaTemplateName: locale?.metaTemplateName || null,
      language,
      languageCode: locale?.languageCode || null,
      category: entry.category
    };
  }

  if (!locale) {
    return {
      ok: false,
      status: "blocked_template_missing",
      reason: "LOCALE_NOT_DEFINED",
      templateKey: entry.key,
      metaTemplateName: null,
      language,
      languageCode: null
    };
  }

  if (!locale.approved) {
    return {
      ok: false,
      status: "blocked_template_unapproved",
      reason: "TEMPLATE_NOT_APPROVED",
      templateKey: entry.key,
      metaTemplateName: locale.metaTemplateName,
      language,
      languageCode: locale.languageCode,
      category: entry.category
    };
  }

  if (!locale.active || !locale.metaTemplateName) {
    return {
      ok: false,
      status: "blocked_template_missing",
      reason: !locale.metaTemplateName ? "META_TEMPLATE_NAME_MISSING" : "TEMPLATE_INACTIVE",
      templateKey: entry.key,
      metaTemplateName: locale.metaTemplateName,
      language,
      languageCode: locale.languageCode,
      category: entry.category
    };
  }

  // Defense in depth — stale Meta names must never authorize a send.
  if (isStaleMetaTemplateName(locale.metaTemplateName)) {
    return {
      ok: false,
      status: "blocked_template_unapproved",
      reason: "STALE_META_TEMPLATE_NAME",
      templateKey: entry.key,
      metaTemplateName: locale.metaTemplateName,
      language,
      languageCode: locale.languageCode,
      category: entry.category
    };
  }

  const { bodyKeys, buttonKeys } = resolveBodyAndButtonKeys(entry);
  const bodyValidation = validateOrderedVariables(bodyKeys, variables);

  if (!bodyValidation.ok) {
    return {
      ok: false,
      status: "blocked_template_missing",
      reason: bodyValidation.reason,
      templateKey: entry.key,
      metaTemplateName: locale.metaTemplateName,
      language,
      languageCode: locale.languageCode,
      category: entry.category,
      missingVariables: bodyValidation.missingVariables || [],
      providedVariableKeys: bodyValidation.providedVariableKeys || []
    };
  }

  let resolvedButtonVariables = { ...(buttonVariables || {}) };

  if (buttonKeys.length) {
    const buttonValidation = validateOrderedVariables(buttonKeys, resolvedButtonVariables);

    if (!buttonValidation.ok) {
      return {
        ok: false,
        status: "blocked_template_missing",
        reason: buttonValidation.reason.startsWith("TEMPLATE_")
          ? buttonValidation.reason.replace("TEMPLATE_VARIABLE", "TEMPLATE_BUTTON_VARIABLE")
          : "TEMPLATE_BUTTON_VARIABLES_INVALID",
        templateKey: entry.key,
        metaTemplateName: locale.metaTemplateName,
        language,
        languageCode: locale.languageCode,
        category: entry.category,
        missingVariables: buttonValidation.missingVariables || [],
        providedVariableKeys: buttonValidation.providedVariableKeys || []
      };
    }

    // BR-092 — Zoom URL button must be Meta dynamic suffix for https://zoom.us/j/{{1}}.
    if (buttonKeys.includes("meeting_url")) {
      const normalized = normalizeZoomDynamicUrlButtonParameter(
        resolvedButtonVariables.meeting_url
      );
      if (!normalized.ok || !normalized.parameter) {
        return {
          ok: false,
          status: "blocked_template_missing",
          reason: "TEMPLATE_BUTTON_VARIABLES_INVALID",
          templateKey: entry.key,
          metaTemplateName: locale.metaTemplateName,
          language,
          languageCode: locale.languageCode,
          category: entry.category,
          missingVariables: ["meeting_url"],
          providedVariableKeys: Object.keys(resolvedButtonVariables)
        };
      }
      resolvedButtonVariables = {
        ...resolvedButtonVariables,
        meeting_url: normalized.parameter
      };
    }
  }

  return {
    ok: true,
    status: "authorized_template",
    reason: "APPROVED_TEMPLATE",
    templateKey: entry.key,
    metaTemplateName: locale.metaTemplateName,
    language,
    languageCode: locale.languageCode,
    category: entry.category,
    version: entry.version || "1",
    expectedVariableKeys: bodyKeys,
    expectedButtonVariableKeys: buttonKeys,
    zoomUrlDeliveryMode: entry.zoomUrlDeliveryMode || null,
    variables: { ...variables },
    buttonVariables: resolvedButtonVariables
  };
}

module.exports = {
  BASE_REGISTRY,
  TEMPLATE_LOCALES,
  INTENT_TO_KEY,
  ZOOM_URL_DELIVERY_MODES,
  CANONICAL_META_TEMPLATE_NAMES,
  STALE_META_TEMPLATE_NAMES,
  getCanonicalMetaTemplateName,
  isStaleMetaTemplateName,
  getApprovedTemplateRegistry,
  getTemplateRegistryHealth,
  listRegistryKeys,
  resolveTemplateLanguage,
  resolveRegistryKeyForIntent,
  resolveApprovedTemplate,
  parseApprovedTemplatesEnv,
  validateOrderedVariables
};
