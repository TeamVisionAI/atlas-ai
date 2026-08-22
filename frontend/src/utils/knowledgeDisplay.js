/**
 * BR-153 — Field-facing Knowledge Hub display helpers.
 */

import { KNOWLEDGE_CATEGORY_BY_ID } from "../config/knowledgeHubCategories.js";

const LEGACY_ENGINEERING_PATH_PATTERN =
  /^(CURRENT_STATE|README|BACKLOG)(\.md)?$/i;

export function titleCaseFromFilename(filename) {
  return String(filename || "")
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getArticleDisplayTitle(article) {
  if (!article) {
    return "";
  }
  return (
    article.displayTitle ||
    article.title ||
    titleCaseFromFilename(article.name || article.path || "")
  );
}

export function getCategoryLabel(article, t) {
  const categoryId = article?.categoryId;
  const labelKey = article?.categoryLabelKey || KNOWLEDGE_CATEGORY_BY_ID[categoryId]?.labelKey;
  return labelKey && t?.[labelKey] ? t[labelKey] : "";
}

export function formatArticleUpdatedAt(value, locale = "en-US") {
  if (!value) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function formatReadTimeLabel(article, t) {
  const raw = article?.estimatedReadTime;
  if (!raw) {
    return "";
  }
  const normalized = String(raw).trim();
  if (/min/i.test(normalized)) {
    return normalized;
  }
  return t?.knowledgeHubReadTimeMinutes
    ? t.knowledgeHubReadTimeMinutes.replace("{minutes}", normalized)
    : `${normalized} min`;
}

export function isLegacyEngineeringPath(path) {
  const normalized = String(path || "").trim().replace(/\\/g, "/");
  if (!normalized) {
    return true;
  }
  if (LEGACY_ENGINEERING_PATH_PATTERN.test(normalized)) {
    return true;
  }
  if (/^\d{2}-/.test(normalized)) {
    return true;
  }
  if (normalized.includes("/docs/") || normalized.startsWith("docs/")) {
    return true;
  }
  return false;
}

export function isValidAgentLibraryPath(path, catalogPaths = null) {
  const normalized = String(path || "").trim().replace(/\\/g, "/");
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    return false;
  }
  if (isLegacyEngineeringPath(normalized)) {
    return false;
  }
  if (catalogPaths instanceof Set) {
    return catalogPaths.has(normalized);
  }
  return /^[a-z0-9-]+\/[a-z0-9-]+\.md$/i.test(normalized);
}

export function enrichArticleForDisplay(article, t, locale) {
  if (!article) {
    return null;
  }
  const displayTitle = getArticleDisplayTitle(article);
  const categoryLabel = getCategoryLabel(article, t);
  return {
    ...article,
    displayTitle,
    categoryLabel,
    updatedLabel: formatArticleUpdatedAt(article.updatedAt, locale),
    readTimeLabel: formatReadTimeLabel(article, t)
  };
}

export function buildBreadcrumbTrail({ t, category, article }) {
  const trail = [{ id: "hub", label: t.knowledgeHubTitle }];
  if (category?.labelKey) {
    trail.push({ id: "category", label: t[category.labelKey] });
  }
  if (article?.displayTitle) {
    trail.push({ id: "article", label: article.displayTitle });
  }
  return trail;
}
