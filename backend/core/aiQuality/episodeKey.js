/**
 * BR-175 — one open case per conversation/failure episode.
 */

function utcDayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildEpisodeKey({
  organizationId,
  prospectId = null,
  signalType,
  detectedAt = new Date()
} = {}) {
  const org = String(organizationId || "unknown");
  const prospect = String(prospectId || "none");
  const signal = String(signalType || "unknown");
  return `${org}:${prospect}:${signal}:${utcDayKey(detectedAt)}`;
}

module.exports = {
  utcDayKey,
  buildEpisodeKey
};
