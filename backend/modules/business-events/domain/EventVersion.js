/**
 * Sprint 14.2 — Business Event payload schema versioning.
 *
 * `version` is the payload schema version (not the event type catalog version).
 * Default = "1". Historical events may store "1.0" — both remain readable.
 * Breaking payload changes increment the major version (e.g. "1" → "2").
 */

const { BusinessEventDomainError } = require("./errors/BusinessEventDomainError");

const DEFAULT_EVENT_SCHEMA_VERSION = "1";
const LEGACY_EVENT_SCHEMA_VERSION = "1.0";

const SUPPORTED_EVENT_SCHEMA_VERSIONS = Object.freeze(["1", "1.0"]);

function isSupportedVersion(version) {
  return SUPPORTED_EVENT_SCHEMA_VERSIONS.includes(String(version));
}

/**
 * Normalize version for newly created events.
 * @param {string|null|undefined} version
 * @returns {string}
 */
function normalizeForCreate(version) {
  if (version == null || version === "") {
    return DEFAULT_EVENT_SCHEMA_VERSION;
  }

  const normalized = String(version);

  if (normalized === LEGACY_EVENT_SCHEMA_VERSION) {
    return DEFAULT_EVENT_SCHEMA_VERSION;
  }

  if (!isSupportedVersion(normalized)) {
    throw new BusinessEventDomainError(`Unsupported event schema version: ${normalized}`, {
      publicCode: "INVALID_EVENT_VERSION"
    });
  }

  return normalized;
}

/**
 * Validate version when reconstituting persisted events (historical tolerance).
 * @param {string|null|undefined} version
 */
function assertReadableVersion(version) {
  if (version == null || version === "") {
    return DEFAULT_EVENT_SCHEMA_VERSION;
  }

  if (!isSupportedVersion(version)) {
    throw new BusinessEventDomainError(`Unreadable event schema version: ${version}`, {
      publicCode: "INVALID_EVENT_VERSION"
    });
  }

  return String(version);
}

module.exports = {
  DEFAULT_EVENT_SCHEMA_VERSION,
  LEGACY_EVENT_SCHEMA_VERSION,
  SUPPORTED_EVENT_SCHEMA_VERSIONS,
  isSupportedVersion,
  normalizeForCreate,
  assertReadableVersion
};
