/**
 * BR-154 — Knowledge Hub locale resolution (single-language article experience).
 */

const KNOWLEDGE_HUB_LOCALES = Object.freeze(["en", "es"]);
const DEFAULT_LOCALE = "en";

function normalizeKnowledgeLocale(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (raw === "es" || raw === "es-es" || raw.startsWith("es-")) {
    return "es";
  }

  return DEFAULT_LOCALE;
}

function parseLocalizedFilename(filename) {
  const base = String(filename || "").trim();
  if (!base.endsWith(".md")) {
    return null;
  }

  const localeMatch = base.match(/^(.+)\.(en|es)\.md$/i);
  if (localeMatch) {
    return {
      slug: localeMatch[1],
      locale: localeMatch[2].toLowerCase()
    };
  }

  const legacyMatch = base.match(/^(.+)\.md$/i);
  if (!legacyMatch) {
    return null;
  }

  return {
    slug: legacyMatch[1],
    locale: DEFAULT_LOCALE
  };
}

function buildArticlePath(categoryFolder, slug) {
  return `${categoryFolder}/${slug}`;
}

function resolveDiskFilename(slug, locale) {
  return `${slug}.${locale}.md`;
}

function normalizeArticlePath(input) {
  let normalized = String(input || "").trim().replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }

  if (normalized.endsWith(".md")) {
    normalized = normalized.slice(0, -3);
  }

  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex === -1) {
    return normalized.replace(/\.(en|es)$/i, "");
  }

  const folder = normalized.slice(0, slashIndex);
  const filename = normalized.slice(slashIndex + 1);
  const parsed = parseLocalizedFilename(`${filename}.md`);
  const slug = parsed?.slug || filename.replace(/\.(en|es)$/i, "");
  return buildArticlePath(folder, slug);
}

function resolveArticleDiskPath(articlePath, locale) {
  const normalized = normalizeArticlePath(articlePath);
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex === -1) {
    throw Object.assign(new Error("Invalid document path."), {
      statusCode: 400,
      publicCode: "INVALID_PATH"
    });
  }

  const folder = normalized.slice(0, slashIndex);
  const slug = normalized.slice(slashIndex + 1);
  return `${folder}/${resolveDiskFilename(slug, locale)}`;
}

module.exports = {
  KNOWLEDGE_HUB_LOCALES,
  DEFAULT_LOCALE,
  normalizeKnowledgeLocale,
  parseLocalizedFilename,
  buildArticlePath,
  resolveDiskFilename,
  normalizeArticlePath,
  resolveArticleDiskPath
};
