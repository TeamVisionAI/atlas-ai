/**
 * Sprint 13.8 — BR-048 Personnel Directory.
 * Canonical assignable representative list for Interview Assignment and future assignment features.
 */

const { ROLES, USER_STATUSES, normalizeRole, normalizeStatus } = require("../security/roles");

const INTERVIEW_ELIGIBLE_ROLES = Object.freeze([
  ROLES.RECRUITER,
  ROLES.AGENT,
  ROLES.DIVISION_LEADER,
  ROLES.RVP,
  ROLES.ADMINISTRATOR
]);

const EXCLUDED_ASSIGNMENT_ROLES = Object.freeze([ROLES.OPERATIONS, ROLES.SUPPORT]);

const BLOCKED_ACCOUNT_PREFIXES = Object.freeze(["sim-", "demo-"]);

const BLOCKED_DISPLAY_NAMES = Object.freeze([
  "invite flow",
  "ops access",
  "ops ops",
  "system",
  "automation"
]);

const ROLE_LABELS = Object.freeze({
  [ROLES.ADMINISTRATOR]: "Administrator",
  [ROLES.RVP]: "RVP",
  [ROLES.DIVISION_LEADER]: "Division Leader",
  [ROLES.AGENT]: "Agent",
  [ROLES.RECRUITER]: "Recruiter"
});

function resolveUserDisplayName(user) {
  const displayName = String(user?.display_name || "").trim();

  if (displayName) {
    return displayName;
  }

  return [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.email || "";
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasBlockedPrefix(value) {
  const normalized = normalizeComparableText(value);

  return BLOCKED_ACCOUNT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isBlockedPersonnelAccount(user = {}) {
  const email = normalizeComparableText(user.email);
  const repId = normalizeComparableText(user.rep_id);
  const displayName = normalizeComparableText(
    user.display_name || resolveUserDisplayName(user)
  );

  if (hasBlockedPrefix(email) || hasBlockedPrefix(repId) || hasBlockedPrefix(user.id)) {
    return true;
  }

  if (BLOCKED_DISPLAY_NAMES.includes(displayName)) {
    return true;
  }

  if (email.endsWith("@example.com") || email.endsWith("@example.org")) {
    return true;
  }

  return false;
}

function isActivePersonnelUser(user = {}) {
  const status = normalizeStatus(user.status);

  if (status !== USER_STATUSES.ACTIVE) {
    return false;
  }

  if (user.archived_at) {
    return false;
  }

  if (user.deleted_at) {
    return false;
  }

  return true;
}

function isInterviewEligibleRole(role) {
  const normalized = normalizeRole(role);

  if (!normalized || EXCLUDED_ASSIGNMENT_ROLES.includes(normalized)) {
    return false;
  }

  return INTERVIEW_ELIGIBLE_ROLES.includes(normalized);
}

function belongsToOrganization(user = {}, organizationId) {
  if (!organizationId) {
    return false;
  }

  return String(user.organization_id || "") === String(organizationId);
}

function buildBaseDisplayName(user = {}) {
  const resolved = String(resolveUserDisplayName(user) || "").trim();

  if (resolved) {
    return resolved;
  }

  return String(user.email || "").trim();
}

function formatRoleLabel(role) {
  const normalized = normalizeRole(role);
  return ROLE_LABELS[normalized] || null;
}

function deduplicateUserRecords(users = []) {
  const seen = new Set();

  return users.filter((user) => {
    const id = String(user?.id || "");

    if (!id || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

function filterAssignableUserRecords(users = [], organizationId) {
  return deduplicateUserRecords(users).filter((user) => {
    if (!belongsToOrganization(user, organizationId)) {
      return false;
    }

    if (!isActivePersonnelUser(user)) {
      return false;
    }

    if (isBlockedPersonnelAccount(user)) {
      return false;
    }

    if (!isInterviewEligibleRole(user.role)) {
      return false;
    }

    return true;
  });
}

function applyDisplayNameDisambiguation(entries = []) {
  const baseNameCounts = new Map();

  for (const entry of entries) {
    const baseName = entry.baseDisplayName;
    baseNameCounts.set(baseName, (baseNameCounts.get(baseName) || 0) + 1);
  }

  return entries.map((entry) => {
    const needsSuffix = (baseNameCounts.get(entry.baseDisplayName) || 0) > 1;
    const roleLabel = formatRoleLabel(entry.role);
    const displayName =
      needsSuffix && roleLabel
        ? `${entry.baseDisplayName} • ${roleLabel}`
        : entry.baseDisplayName;

    return {
      ...entry,
      displayName
    };
  });
}

function sortRepresentatives(representatives = []) {
  return [...representatives].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, undefined, {
      sensitivity: "base"
    })
  );
}

function mapUserToPersonnelRecord(user = {}) {
  const role = normalizeRole(user.role);

  return {
    id: user.id,
    baseDisplayName: buildBaseDisplayName(user),
    role,
    avatarUrl: user.photo_url || null,
    repId: user.rep_id || null,
    isAvailable: true,
    workload: null,
    interviewEligible: true
  };
}

function buildPersonnelDirectoryEntries(users = [], organizationId) {
  const filtered = filterAssignableUserRecords(users, organizationId);
  const mapped = filtered.map(mapUserToPersonnelRecord);
  const labeled = applyDisplayNameDisambiguation(mapped);

  return sortRepresentatives(
    labeled.map(({ baseDisplayName, ...entry }) => entry)
  );
}

/**
 * @param {{ organizationId?: string }} context
 * @param {{ listOrganizationUsers?: Function, options?: object }} [deps]
 */
async function listAssignableRepresentatives(context = {}, deps = {}) {
  const organizationId = context.organizationId || null;

  if (!organizationId) {
    return [];
  }

  const fetchUsers =
    deps.listOrganizationUsers ||
    require("../services/atlasUserService").listOrganizationUsers;
  const users = await fetchUsers(organizationId, deps.options);

  return buildPersonnelDirectoryEntries(users, organizationId);
}

module.exports = {
  INTERVIEW_ELIGIBLE_ROLES,
  EXCLUDED_ASSIGNMENT_ROLES,
  BLOCKED_ACCOUNT_PREFIXES,
  BLOCKED_DISPLAY_NAMES,
  isBlockedPersonnelAccount,
  isActivePersonnelUser,
  isInterviewEligibleRole,
  buildBaseDisplayName,
  formatRoleLabel,
  deduplicateUserRecords,
  filterAssignableUserRecords,
  applyDisplayNameDisambiguation,
  sortRepresentatives,
  buildPersonnelDirectoryEntries,
  listAssignableRepresentatives
};
