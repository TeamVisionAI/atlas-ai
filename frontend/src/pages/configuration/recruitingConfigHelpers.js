import {
  FORBIDDEN_RECRUITING_CONFIG_KEYS,
  QUALIFICATION_FIELD_IDS,
  RECRUITING_CONFIG_SOURCES,
  RECRUITING_TOP_LEVEL_SECTIONS
} from "../../config/recruitingConfigConstants.js";

function stableSerialize(value) {
  return JSON.stringify(value);
}

export function configsEqual(left, right) {
  return stableSerialize(left) === stableSerialize(right);
}

/**
 * Build PATCH body with only changed top-level sections (C2 save contract).
 */
export function buildRecruitingConfigPatch(baseline, draft) {
  if (!baseline || !draft) {
    return structuredClone(draft);
  }

  const patch = {};

  for (const section of RECRUITING_TOP_LEVEL_SECTIONS) {
    if (!configsEqual(baseline[section], draft[section])) {
      patch[section] = structuredClone(draft[section]);
    }
  }

  return patch;
}

export function isRecruitingConfigDirty(baseline, draft) {
  return Object.keys(buildRecruitingConfigPatch(baseline, draft)).length > 0;
}

export function isFieldEnabled(fieldId, fieldOrder) {
  return Array.isArray(fieldOrder) && fieldOrder.includes(fieldId);
}

export function setFieldEnabled(fieldId, enabled, fieldOrder, requiredFields) {
  const order = [...(fieldOrder || [])];
  const required = [...(requiredFields || [])];

  if (enabled) {
    if (!order.includes(fieldId)) {
      order.push(fieldId);
    }
  } else {
    const orderIndex = order.indexOf(fieldId);
    if (orderIndex >= 0) {
      order.splice(orderIndex, 1);
    }
    const requiredIndex = required.indexOf(fieldId);
    if (requiredIndex >= 0) {
      required.splice(requiredIndex, 1);
    }
  }

  return { fieldOrder: order, requiredFields: required };
}

export function setFieldRequired(fieldId, required, fieldOrder, requiredFields) {
  const requiredList = [...(requiredFields || [])];
  const index = requiredList.indexOf(fieldId);

  if (required && isFieldEnabled(fieldId, fieldOrder)) {
    if (index < 0) {
      requiredList.push(fieldId);
    }
  } else if (index >= 0) {
    requiredList.splice(index, 1);
  }

  return requiredList;
}

export function moveFieldInOrder(fieldOrder, fieldId, direction) {
  const order = [...(fieldOrder || [])];
  const index = order.indexOf(fieldId);
  if (index < 0) {
    return order;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length) {
    return order;
  }

  [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
  return order;
}

export function getQuestionForField(questions, fieldId) {
  return (questions || []).find((item) => item.fieldId === fieldId) || {
    fieldId,
    text_en: "",
    text_es: ""
  };
}

export function upsertQuestion(questions, fieldId, lang, text) {
  const list = [...(questions || [])];
  const index = list.findIndex((item) => item.fieldId === fieldId);
  const key = lang === "es" ? "text_es" : "text_en";

  if (index >= 0) {
    list[index] = { ...list[index], [key]: text };
  } else {
    list.push({ fieldId, text_en: "", text_es: "", [key]: text });
  }

  return list;
}

export function addLocalCity(localCities, city) {
  const trimmed = String(city || "").trim();
  if (!trimmed) {
    return localCities || [];
  }

  const list = [...(localCities || [])];
  const exists = list.some((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (!exists) {
    list.push(trimmed);
  }
  return list;
}

export function removeLocalCity(localCities, city) {
  return (localCities || []).filter((item) => item !== city);
}

export function addFaqEntry(faq, entry) {
  return [...(faq || []), entry];
}

export function updateFaqEntry(faq, index, entry) {
  return (faq || []).map((item, itemIndex) => (itemIndex === index ? { ...item, ...entry } : item));
}

export function removeFaqEntry(faq, index) {
  return (faq || []).filter((_, itemIndex) => itemIndex !== index);
}

export function faqIdsAreUnique(faq) {
  const ids = new Set();
  for (const entry of faq || []) {
    const id = String(entry?.id || "").trim();
    if (!id || ids.has(id)) {
      return false;
    }
    ids.add(id);
  }
  return true;
}

export function toggleSupportedLanguage(supportedLanguages, language, enabled) {
  const list = [...(supportedLanguages || [])];
  const index = list.indexOf(language);

  if (enabled && index < 0) {
    list.push(language);
  }

  if (!enabled && index >= 0) {
    list.splice(index, 1);
  }

  return list;
}

export function toggleAllowedMode(allowedModes, mode, enabled) {
  const list = [...(allowedModes || [])];
  const index = list.indexOf(mode);

  if (enabled && index < 0) {
    list.push(mode);
  }

  if (!enabled && index >= 0) {
    list.splice(index, 1);
  }

  return list;
}

export function toggleObjectionKey(objectionKeys, key, enabled) {
  const list = [...(objectionKeys || [])];
  const index = list.indexOf(key);

  if (enabled && index < 0) {
    list.push(key);
  }

  if (!enabled && index >= 0) {
    list.splice(index, 1);
  }

  return list;
}

export function containsForbiddenRecruitingKey(value, path = "", found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => containsForbiddenRecruitingKey(item, `${path}[${index}]`, found));
    return found;
  }

  if (!value || typeof value !== "object") {
    return found;
  }

  for (const key of Object.keys(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_RECRUITING_CONFIG_KEYS.includes(key)) {
      found.push(nextPath);
    }
    containsForbiddenRecruitingKey(value[key], nextPath, found);
  }

  return found;
}

export function assertCanonicalFieldIds(fieldOrder) {
  return (fieldOrder || []).every((fieldId) => QUALIFICATION_FIELD_IDS.includes(fieldId));
}

export function shouldShowDefaultTemplateNotice(meta) {
  return (
    meta?.source === RECRUITING_CONFIG_SOURCES.DEFAULT_TEMPLATE && meta?.persisted === false
  );
}

export function buildSupportModeTenantLabel(organizationName) {
  return organizationName ? `Configuring: ${organizationName}` : "";
}

export function formatRecruitingConfigError(error) {
  if (!error) {
    return "Unable to save recruiting configuration.";
  }

  const details = Array.isArray(error.details) ? error.details : error.payload?.details;
  if (Array.isArray(details) && details.length > 0) {
    return `${error.message || "Recruiting config is invalid"}\n${details.join("\n")}`;
  }

  return error.message || "Unable to save recruiting configuration.";
}
