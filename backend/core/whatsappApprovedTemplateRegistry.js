/**
 * Approved Meta WhatsApp template registry (BR-075).
 * Internal copy templates are NOT Meta-approved templates.
 * Only registry entries marked approved + active with an explicit metaTemplateName may send outside the customer-care window.
 */

const {
  normalizePreferredLanguage,
  DEFAULT_PREFERRED_LANGUAGE
} = require("./prospectLanguage");

const TEMPLATE_LOCALES = Object.freeze(["english", "spanish"]);

/**
 * Internal intent keys → registry entries.
 * metaTemplateName is null until operational configuration activates them.
 */
const BASE_REGISTRY = Object.freeze({
  interview_reminder: Object.freeze({
    key: "interview_reminder",
    category: "utility",
    intents: Object.freeze([
      "APPOINTMENT_REMINDER",
      "send_interview_reminder",
      "REMINDER_24H",
      "REMINDER_1H",
      "REMINDER_15M",
      "CONFIRMATION"
    ]),
    expectedVariableKeys: Object.freeze(["prospect_first_name", "interview_when"]),
    locales: Object.freeze({
      english: Object.freeze({
        languageCode: "en",
        metaTemplateName: null,
        approved: false,
        active: false
      }),
      spanish: Object.freeze({
        languageCode: "es",
        metaTemplateName: null,
        approved: false,
        active: false
      })
    })
  }),
  follow_up: Object.freeze({
    key: "follow_up",
    category: "utility",
    intents: Object.freeze(["FOLLOW_UP", "NO_RESPONSE_FOLLOW_UP", "WHATSAPP_FOLLOW_UP"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    locales: Object.freeze({
      english: Object.freeze({
        languageCode: "en",
        metaTemplateName: null,
        approved: false,
        active: false
      }),
      spanish: Object.freeze({
        languageCode: "es",
        metaTemplateName: null,
        approved: false,
        active: false
      })
    })
  }),
  missed_appointment: Object.freeze({
    key: "missed_appointment",
    category: "utility",
    intents: Object.freeze(["MISSED_APPOINTMENT", "send_missed_appointment"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    locales: Object.freeze({
      english: Object.freeze({
        languageCode: "en",
        metaTemplateName: null,
        approved: false,
        active: false
      }),
      spanish: Object.freeze({
        languageCode: "es",
        metaTemplateName: null,
        approved: false,
        active: false
      })
    })
  }),
  interview_details: Object.freeze({
    key: "interview_details",
    category: "utility",
    intents: Object.freeze([
      "INTERVIEW_DETAILS",
      "RESCHEDULE_CONFIRMATION",
      "SCHEDULE_CONFIRMATION"
    ]),
    expectedVariableKeys: Object.freeze(["prospect_first_name", "interview_when"]),
    locales: Object.freeze({
      english: Object.freeze({
        languageCode: "en",
        metaTemplateName: null,
        approved: false,
        active: false
      }),
      spanish: Object.freeze({
        languageCode: "es",
        metaTemplateName: null,
        approved: false,
        active: false
      })
    })
  }),
  human_assist_notice: Object.freeze({
    key: "human_assist_notice",
    category: "utility",
    intents: Object.freeze(["HUMAN_ASSIST", "HANDOFF", "HUMAN_ASSIST_NOTICE"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    locales: Object.freeze({
      english: Object.freeze({
        languageCode: "en",
        metaTemplateName: null,
        approved: false,
        active: false
      }),
      spanish: Object.freeze({
        languageCode: "es",
        metaTemplateName: null,
        approved: false,
        active: false
      })
    })
  }),
  lead_welcome: Object.freeze({
    key: "lead_welcome",
    category: "marketing",
    intents: Object.freeze(["FACEBOOK_LEAD_WELCOME", "LEAD_WELCOME"]),
    expectedVariableKeys: Object.freeze(["prospect_first_name"]),
    locales: Object.freeze({
      english: Object.freeze({
        languageCode: "en",
        metaTemplateName: null,
        approved: false,
        active: false
      }),
      spanish: Object.freeze({
        languageCode: "es",
        metaTemplateName: null,
        approved: false,
        active: false
      })
    })
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
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { __parseError: true };
  }
}

function applyOperationalOverrides(registry, overrides = {}) {
  if (overrides.__parseError) {
    return registry;
  }

  Object.entries(overrides).forEach(([key, localeMap]) => {
    if (!registry[key] || !localeMap || typeof localeMap !== "object") {
      return;
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

      registry[key].locales[locale] = {
        ...registry[key].locales[locale],
        metaTemplateName,
        approved: Boolean(override.approved) && Boolean(metaTemplateName),
        active: Boolean(override.active) && Boolean(override.approved) && Boolean(metaTemplateName)
      };
    });
  });

  return registry;
}

function getApprovedTemplateRegistry(envRaw) {
  return applyOperationalOverrides(deepCloneRegistry(), parseApprovedTemplatesEnv(envRaw));
}

function listRegistryKeys(registry = getApprovedTemplateRegistry()) {
  return Object.keys(registry);
}

function resolveTemplateLanguage(prospect = {}) {
  const preferred = normalizePreferredLanguage(prospect.preferred_language);

  if (preferred) {
    return preferred;
  }

  // Documented safe fallback when preferred_language is missing (BR-041 default).
  // Mutable conversation-language fields must not override a valid preferred language,
  // and must not silently drive template locale selection in this gate.
  return DEFAULT_PREFERRED_LANGUAGE;
}

function resolveRegistryKeyForIntent(intent, explicitKey = null, registry = getApprovedTemplateRegistry()) {
  if (explicitKey) {
    if (!registry[explicitKey]) {
      return { ok: false, code: "UNKNOWN_TEMPLATE_KEY", key: null };
    }

    return { ok: true, key: explicitKey };
  }

  const mapped = INTENT_TO_KEY[intent];

  if (!mapped || !registry[mapped]) {
    return { ok: false, code: "NO_TEMPLATE_FOR_INTENT", key: null };
  }

  return { ok: true, key: mapped };
}

function resolveApprovedTemplate({
  intent,
  templateKey = null,
  prospect = {},
  variables = {},
  callerMetaTemplateName = null,
  registry = getApprovedTemplateRegistry()
} = {}) {
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
      languageCode: locale.languageCode
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
      languageCode: locale.languageCode
    };
  }

  const providedKeys = Object.keys(variables || {});
  const missing = entry.expectedVariableKeys.filter((key) => {
    const value = variables[key];
    return value == null || String(value).trim() === "";
  });

  if (missing.length) {
    return {
      ok: false,
      status: "blocked_template_missing",
      reason: "TEMPLATE_VARIABLES_INVALID",
      templateKey: entry.key,
      metaTemplateName: locale.metaTemplateName,
      language,
      languageCode: locale.languageCode,
      missingVariables: missing,
      providedVariableKeys: providedKeys
    };
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
    expectedVariableKeys: entry.expectedVariableKeys,
    variables: { ...variables }
  };
}

module.exports = {
  BASE_REGISTRY,
  TEMPLATE_LOCALES,
  INTENT_TO_KEY,
  getApprovedTemplateRegistry,
  listRegistryKeys,
  resolveTemplateLanguage,
  resolveRegistryKeyForIntent,
  resolveApprovedTemplate,
  parseApprovedTemplatesEnv
};
