/**
 * BR-153 — Agent library article display metadata (field-facing titles/summaries).
 */

function extractHeadingTitle(markdown) {
  const match = String(markdown || "").match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || null;
}

function titleCaseFromFilename(filename) {
  return String(filename || "")
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function estimateReadTimeMinutes(body) {
  const words = String(body || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function formatReadTime(meta, body) {
  if (meta.estimatedReadTime) {
    return String(meta.estimatedReadTime).trim();
  }
  if (meta.readTime) {
    return String(meta.readTime).trim();
  }
  return `${estimateReadTimeMinutes(body)} min`;
}

function parseKeywords(meta) {
  return String(meta.keywords || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildArticleMetadata({ meta = {}, body = "", filename = "", category = null }) {
  const headingTitle = extractHeadingTitle(body);
  const displayTitle =
    String(meta.displayTitle || "").trim() ||
    headingTitle ||
    titleCaseFromFilename(filename);
  const shortSummary = String(meta.shortSummary || meta.summary || "").trim();
  const categoryId = category?.id || String(meta.categoryId || "").trim() || null;

  return {
    displayTitle,
    shortSummary,
    categoryId,
    categoryLabelKey: category?.labelKey || null,
    keywords: parseKeywords(meta),
    estimatedReadTime: formatReadTime(meta, body),
    title: displayTitle
  };
}

module.exports = {
  extractHeadingTitle,
  titleCaseFromFilename,
  estimateReadTimeMinutes,
  formatReadTime,
  buildArticleMetadata
};
