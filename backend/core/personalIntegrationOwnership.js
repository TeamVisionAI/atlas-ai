/**
 * BR-147 — Personal vs legacy organization integration ownership.
 *
 * Ownership is explicit:
 * - user_id NOT NULL → personal / user-owned
 * - user_id IS NULL → legacy organization-owned (do not infer from connected_by)
 *
 * Hierarchy visibility never grants integration management of another user.
 */

const OWNERSHIP = Object.freeze({
  PERSONAL: "personal",
  ORGANIZATION: "organization"
});

function normalizeUuid(value) {
  const text = String(value || "").trim();
  return text || null;
}

function classifyIntegrationOwnership(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const userId = normalizeUuid(row.user_id || row.userId);
  if (userId) {
    return {
      kind: OWNERSHIP.PERSONAL,
      organizationId: normalizeUuid(row.organization_id || row.organizationId),
      userId
    };
  }

  return {
    kind: OWNERSHIP.ORGANIZATION,
    organizationId: normalizeUuid(row.organization_id || row.organizationId),
    userId: null
  };
}

/**
 * Resolve which Google credentials to use for an interviewer.
 *
 * Prefer personal. Org-legacy fallback is opt-in (event sync for tenants that
 * still only have an organization-owned calendar). Free/busy for agents must
 * pass allowOrgLegacyFallback=false so RL never inherits RVP busy blocks.
 */
function selectGoogleIntegrationRow({
  personalRow = null,
  organizationLegacyRow = null,
  allowOrgLegacyFallback = false
} = {}) {
  if (personalRow && String(personalRow.status || "") === "connected") {
    return { row: personalRow, ownership: OWNERSHIP.PERSONAL };
  }

  if (
    allowOrgLegacyFallback &&
    organizationLegacyRow &&
    String(organizationLegacyRow.status || "") === "connected"
  ) {
    return { row: organizationLegacyRow, ownership: OWNERSHIP.ORGANIZATION };
  }

  if (personalRow) {
    return { row: personalRow, ownership: OWNERSHIP.PERSONAL };
  }

  return { row: null, ownership: null };
}

/**
 * Actor may manage personal integrations for themselves always when permitted.
 * Actor may manage organization-owned integrations only with org:write.
 */
function canManageIntegrationRow({
  actorUserId,
  actorHasOrgWrite,
  row
} = {}) {
  const ownership = classifyIntegrationOwnership(row);
  if (!ownership) {
    return false;
  }

  if (ownership.kind === OWNERSHIP.PERSONAL) {
    return Boolean(actorUserId && ownership.userId === String(actorUserId));
  }

  return Boolean(actorHasOrgWrite);
}

module.exports = {
  OWNERSHIP,
  classifyIntegrationOwnership,
  selectGoogleIntegrationRow,
  canManageIntegrationRow,
  normalizeUuid
};
