/**
 * C1 — Validate and merge organization_settings.settings.recruiting.
 */

const {
  SCHEMA_VERSION,
  ALLOWED_TOP_LEVEL_SECTIONS,
  INDUSTRIES,
  LANGUAGES,
  TONES,
  INTERVIEW_MODES,
  QUALIFICATION_FIELD_IDS,
  FORBIDDEN_CONFIG_KEYS,
  LIMITS
} = require("./constants");
const { cloneTeamVisionRecruitingDefault } = require("./teamVisionDefaultSnapshot");

function validationError(message, details = []) {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicCode = "INVALID_RECRUITING_CONFIG";
  error.details = details;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectForbiddenKeys(value, path, found) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, `${path}[${index}]`, found));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_CONFIG_KEYS.includes(key)) {
      found.push(nextPath);
    }
    collectForbiddenKeys(value[key], nextPath, found);
  }
}

function assertString(value, path, max, details, { required = false } = {}) {
  if (value == null) {
    if (required) {
      details.push(`${path} is required`);
    }
    return;
  }
  if (typeof value !== "string") {
    details.push(`${path} must be a string`);
    return;
  }
  if (value.length > max) {
    details.push(`${path} exceeds ${max} characters`);
  }
}

function assertEnum(value, path, allowed, details) {
  if (!allowed.includes(value)) {
    details.push(`${path} must be one of: ${allowed.join(", ")}`);
  }
}

function assertLanguageList(value, path, details) {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.maxSupportedLanguages) {
    details.push(`${path} must be a non-empty subset of es/en`);
    return;
  }
  const unique = new Set();
  for (const item of value) {
    if (!LANGUAGES.includes(item)) {
      details.push(`${path} contains unsupported language ${item}`);
    }
    unique.add(item);
  }
  if (unique.size !== value.length) {
    details.push(`${path} must not contain duplicates`);
  }
}

function validateProfile(profile, details) {
  if (!isPlainObject(profile)) {
    details.push("profile must be an object");
    return;
  }
  assertEnum(profile.industry, "profile.industry", INDUSTRIES, details);
  assertString(profile.businessName, "profile.businessName", LIMITS.shortText, details, {
    required: true
  });
  assertString(profile.recruitingObjective, "profile.recruitingObjective", LIMITS.longText, details, {
    required: true
  });
  assertEnum(profile.defaultLanguage, "profile.defaultLanguage", LANGUAGES, details);
  assertLanguageList(profile.supportedLanguages, "profile.supportedLanguages", details);
  if (
    Array.isArray(profile.supportedLanguages) &&
    profile.defaultLanguage &&
    !profile.supportedLanguages.includes(profile.defaultLanguage)
  ) {
    details.push("profile.defaultLanguage must be included in supportedLanguages");
  }
  assertEnum(profile.tone, "profile.tone", TONES, details);

  for (const key of Object.keys(profile)) {
    if (
      ![
        "industry",
        "businessName",
        "recruitingObjective",
        "defaultLanguage",
        "supportedLanguages",
        "tone"
      ].includes(key)
    ) {
      details.push(`profile.${key} is not allowed`);
    }
  }
}

function validateCoverage(coverage, details) {
  if (!isPlainObject(coverage)) {
    details.push("coverage must be an object");
    return;
  }
  assertString(coverage.officeAddress, "coverage.officeAddress", LIMITS.mediumText, details, {
    required: true
  });
  if (!Array.isArray(coverage.localCities) || coverage.localCities.length > LIMITS.maxCities) {
    details.push("coverage.localCities must be an array within bounds");
  } else {
    coverage.localCities.forEach((city, index) => {
      assertString(city, `coverage.localCities[${index}]`, LIMITS.shortText, details, {
        required: true
      });
    });
  }
  if (
    !Number.isInteger(coverage.localRadiusMiles) ||
    coverage.localRadiusMiles < 1 ||
    coverage.localRadiusMiles > 200
  ) {
    details.push("coverage.localRadiusMiles must be an integer between 1 and 200");
  }
  assertEnum(coverage.defaultInterviewMode, "coverage.defaultInterviewMode", INTERVIEW_MODES, details);
  for (const key of Object.keys(coverage)) {
    if (!["officeAddress", "localCities", "localRadiusMiles", "defaultInterviewMode"].includes(key)) {
      details.push(`coverage.${key} is not allowed`);
    }
  }
}

function validateFieldIdList(list, path, details) {
  if (!Array.isArray(list) || list.length === 0) {
    details.push(`${path} must be a non-empty array of Atlas field ids`);
    return;
  }
  const seen = new Set();
  for (const fieldId of list) {
    if (!QUALIFICATION_FIELD_IDS.includes(fieldId)) {
      details.push(`${path} contains unknown field id ${fieldId}`);
    }
    if (seen.has(fieldId)) {
      details.push(`${path} contains duplicate field id ${fieldId}`);
    }
    seen.add(fieldId);
  }
}

function validateQualification(qualification, details) {
  if (!isPlainObject(qualification)) {
    details.push("qualification must be an object");
    return;
  }
  validateFieldIdList(qualification.fieldOrder, "qualification.fieldOrder", details);
  validateFieldIdList(qualification.requiredFields, "qualification.requiredFields", details);

  if (!Array.isArray(qualification.disqualifiers) || qualification.disqualifiers.length > LIMITS.maxDisqualifiers) {
    details.push("qualification.disqualifiers must be a bounded array");
  } else {
    qualification.disqualifiers.forEach((item, index) => {
      if (!isPlainObject(item)) {
        details.push(`qualification.disqualifiers[${index}] must be an object`);
        return;
      }
      if (!QUALIFICATION_FIELD_IDS.includes(item.fieldId)) {
        details.push(`qualification.disqualifiers[${index}].fieldId is not an Atlas field id`);
      }
      if (item.when !== false && item.when !== true) {
        details.push(`qualification.disqualifiers[${index}].when must be boolean`);
      }
      assertString(item.action, `qualification.disqualifiers[${index}].action`, LIMITS.shortText, details, {
        required: true
      });
      if (!isPlainObject(item.messages)) {
        details.push(`qualification.disqualifiers[${index}].messages must be an object`);
      } else {
        assertString(item.messages.es, `qualification.disqualifiers[${index}].messages.es`, LIMITS.longText, details);
        assertString(item.messages.en, `qualification.disqualifiers[${index}].messages.en`, LIMITS.longText, details);
      }
    });
  }

  if (!Array.isArray(qualification.questions) || qualification.questions.length > LIMITS.maxQuestions) {
    details.push("qualification.questions must be a bounded array");
  } else {
    qualification.questions.forEach((item, index) => {
      if (!isPlainObject(item)) {
        details.push(`qualification.questions[${index}] must be an object`);
        return;
      }
      if (!QUALIFICATION_FIELD_IDS.includes(item.fieldId)) {
        details.push(`qualification.questions[${index}].fieldId is not an Atlas field id`);
      }
      assertString(item.text_es, `qualification.questions[${index}].text_es`, LIMITS.mediumText, details);
      assertString(item.text_en, `qualification.questions[${index}].text_en`, LIMITS.mediumText, details);
    });
  }

  for (const key of Object.keys(qualification)) {
    if (!["fieldOrder", "requiredFields", "disqualifiers", "questions"].includes(key)) {
      details.push(`qualification.${key} is not allowed`);
    }
  }
}

function validateScheduling(scheduling, details) {
  if (!isPlainObject(scheduling)) {
    details.push("scheduling must be an object");
    return;
  }
  if (scheduling.appointmentPurpose !== "recruiting_interview") {
    details.push("scheduling.appointmentPurpose must be recruiting_interview");
  }
  if (
    !Number.isInteger(scheduling.durationMinutes) ||
    scheduling.durationMinutes < 15 ||
    scheduling.durationMinutes > 120
  ) {
    details.push("scheduling.durationMinutes must be an integer between 15 and 120");
  }
  if (!Array.isArray(scheduling.allowedModes) || scheduling.allowedModes.length === 0) {
    details.push("scheduling.allowedModes must be a non-empty array");
  } else {
    for (const mode of scheduling.allowedModes) {
      if (!INTERVIEW_MODES.includes(mode)) {
        details.push(`scheduling.allowedModes contains invalid mode ${mode}`);
      }
    }
  }
  for (const key of Object.keys(scheduling)) {
    if (!["appointmentPurpose", "durationMinutes", "allowedModes"].includes(key)) {
      details.push(`scheduling.${key} is not allowed`);
    }
  }
}

function validateFaq(faq, details) {
  if (!Array.isArray(faq) || faq.length > LIMITS.maxFaqEntries) {
    details.push("conversation.faq must be a bounded array");
    return;
  }
  const ids = new Set();
  faq.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      details.push(`conversation.faq[${index}] must be an object`);
      return;
    }
    assertString(entry.id, `conversation.faq[${index}].id`, LIMITS.shortText, details, { required: true });
    if (entry.id && ids.has(entry.id)) {
      details.push(`conversation.faq duplicate id ${entry.id}`);
    }
    ids.add(entry.id);
    if (!Array.isArray(entry.keywords) || entry.keywords.length > LIMITS.maxKeywords) {
      details.push(`conversation.faq[${index}].keywords must be a bounded array`);
    } else {
      entry.keywords.forEach((keyword, kIndex) => {
        assertString(keyword, `conversation.faq[${index}].keywords[${kIndex}]`, LIMITS.maxKeywordLength, details, {
          required: true
        });
      });
    }
    assertString(entry.response_en, `conversation.faq[${index}].response_en`, LIMITS.longText, details);
    assertString(entry.response_es, `conversation.faq[${index}].response_es`, LIMITS.longText, details);
    if (entry.response_en == null && entry.response_es == null) {
      details.push(`conversation.faq[${index}] must include response_en or response_es`);
    }
  });
}

function validateConversation(conversation, details) {
  if (!isPlainObject(conversation)) {
    details.push("conversation must be an object");
    return;
  }
  if (!isPlainObject(conversation.openingInstructions)) {
    details.push("conversation.openingInstructions must be an object");
  } else {
    assertString(
      conversation.openingInstructions.es,
      "conversation.openingInstructions.es",
      LIMITS.mediumText,
      details
    );
    assertString(
      conversation.openingInstructions.en,
      "conversation.openingInstructions.en",
      LIMITS.mediumText,
      details
    );
  }
  validateFaq(conversation.faq, details);
  assertString(conversation.handoffDisplayName, "conversation.handoffDisplayName", LIMITS.shortText, details, {
    required: true
  });
  if (
    !Array.isArray(conversation.objectionKeys) ||
    conversation.objectionKeys.length > LIMITS.maxObjectionKeys
  ) {
    details.push("conversation.objectionKeys must be a bounded array");
  } else {
    conversation.objectionKeys.forEach((key, index) => {
      assertString(key, `conversation.objectionKeys[${index}]`, LIMITS.shortText, details, { required: true });
    });
  }
  for (const key of Object.keys(conversation)) {
    if (!["openingInstructions", "faq", "handoffDisplayName", "objectionKeys"].includes(key)) {
      details.push(`conversation.${key} is not allowed`);
    }
  }
}

function validateRecruitingConfig(config) {
  const details = [];
  if (!isPlainObject(config)) {
    throw validationError("Recruiting config must be an object");
  }

  for (const key of Object.keys(config)) {
    if (!ALLOWED_TOP_LEVEL_SECTIONS.includes(key)) {
      details.push(`Unknown top-level section: ${key}`);
    }
  }

  const forbidden = [];
  collectForbiddenKeys(config, "", forbidden);
  forbidden.forEach((path) => details.push(`Forbidden key: ${path}`));

  if (config.schemaVersion !== SCHEMA_VERSION) {
    details.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }

  validateProfile(config.profile, details);
  validateCoverage(config.coverage, details);
  validateQualification(config.qualification, details);
  validateScheduling(config.scheduling, details);
  validateConversation(config.conversation, details);

  if (details.length > 0) {
    throw validationError("Recruiting config is invalid", details);
  }

  return config;
}

function mergeRecruitingConfig(base, patch) {
  if (patch == null) {
    return structuredClone(base);
  }
  if (!isPlainObject(patch)) {
    throw validationError("Recruiting config patch must be an object");
  }

  const forbidden = [];
  collectForbiddenKeys(patch, "", forbidden);
  if (forbidden.length > 0) {
    throw validationError("Recruiting config is invalid", forbidden.map((path) => `Forbidden key: ${path}`));
  }

  for (const key of Object.keys(patch)) {
    if (!ALLOWED_TOP_LEVEL_SECTIONS.includes(key)) {
      throw validationError("Recruiting config is invalid", [`Unknown top-level section: ${key}`]);
    }
  }

  const merged = structuredClone(base);
  if (patch.schemaVersion !== undefined) {
    merged.schemaVersion = patch.schemaVersion;
  }
  if (isPlainObject(patch.profile)) {
    merged.profile = { ...merged.profile, ...patch.profile };
  }
  if (isPlainObject(patch.coverage)) {
    merged.coverage = { ...merged.coverage, ...patch.coverage };
  }
  if (isPlainObject(patch.qualification)) {
    merged.qualification = { ...merged.qualification, ...patch.qualification };
  }
  if (isPlainObject(patch.scheduling)) {
    merged.scheduling = { ...merged.scheduling, ...patch.scheduling };
  }
  if (isPlainObject(patch.conversation)) {
    merged.conversation = { ...merged.conversation, ...patch.conversation };
  }

  return validateRecruitingConfig(merged);
}

function emptyRecruitingConfig() {
  return cloneTeamVisionRecruitingDefault();
}

module.exports = {
  validateRecruitingConfig,
  mergeRecruitingConfig,
  emptyRecruitingConfig,
  validationError
};
