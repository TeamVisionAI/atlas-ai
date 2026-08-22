/**
 * Hierarchy data scope — Team Vision business ranks use reports_to_user_id subtree.
 * Fail closed: missing hierarchy → own/assigned records only (never whole org).
 *
 * Org-wide roles: administrator, rvp
 * Subtree roles: division_leader (SRL/RL/DIV ranks map here by default)
 * Self roles: agent, recruiter (DIS/REP map here by default)
 */

const { ROLES, normalizeRole } = require("../security/roles");

const ORG_WIDE_ROLES = new Set([ROLES.ADMINISTRATOR, ROLES.RVP]);
const SELF_ROLES = new Set([ROLES.AGENT, ROLES.RECRUITER, ROLES.SUPPORT, ROLES.OPERATIONS]);

const HIERARCHY_MODES = Object.freeze({
  ORGANIZATION: "organization",
  SUBTREE: "subtree",
  SELF: "self",
  DENIED: "denied"
});

function collectDescendantIds(rootUserId, childrenByParent) {
  const collected = [];
  const queue = [...(childrenByParent.get(String(rootUserId)) || [])];
  const seen = new Set([String(rootUserId)]);

  while (queue.length) {
    const next = String(queue.shift());
    if (seen.has(next)) {
      continue;
    }
    seen.add(next);
    collected.push(next);
    const kids = childrenByParent.get(next) || [];
    for (const kid of kids) {
      queue.push(kid);
    }
  }

  return collected;
}

function buildChildrenByParent(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const parentId = row.reports_to_user_id ? String(row.reports_to_user_id) : null;
    if (!parentId) {
      continue;
    }
    const childId = String(row.id);
    if (!map.has(parentId)) {
      map.set(parentId, []);
    }
    map.get(parentId).push(childId);
  }

  return map;
}

/**
 * @returns {Promise<{ mode: string, userIds: string[]|null, reason: string }>}
 * userIds null = organization-wide; array = allowed owner/assignee user ids (includes self).
 */
async function resolveHierarchyScopeForUser(user, { loadOrgUsers } = {}) {
  if (!user?.id) {
    return { mode: HIERARCHY_MODES.DENIED, userIds: [], reason: "NO_USER" };
  }

  const userId = String(user.id);
  const role = normalizeRole(user.role) || ROLES.RECRUITER;
  const organizationId = user.organization_id || user.organizationId || null;

  if (ORG_WIDE_ROLES.has(role)) {
    return {
      mode: HIERARCHY_MODES.ORGANIZATION,
      userIds: null,
      reason: "ORG_WIDE_ROLE"
    };
  }

  if (SELF_ROLES.has(role)) {
    return {
      mode: HIERARCHY_MODES.SELF,
      userIds: [userId],
      reason: "SELF_ROLE"
    };
  }

  if (role !== ROLES.DIVISION_LEADER) {
    return {
      mode: HIERARCHY_MODES.SELF,
      userIds: [userId],
      reason: "UNKNOWN_ROLE_FAIL_CLOSED"
    };
  }

  // division_leader / field leaders — subtree or fail closed to self.
  if (!organizationId) {
    return {
      mode: HIERARCHY_MODES.SELF,
      userIds: [userId],
      reason: "MISSING_ORG_FAIL_CLOSED"
    };
  }

  let rows = [];
  try {
    if (typeof loadOrgUsers === "function") {
      rows = await loadOrgUsers(organizationId);
    } else {
      const { supabase } = require("../services/supabaseService");
      const { data, error } = await supabase
        .from("atlas_users")
        .select("id, reports_to_user_id, status")
        .eq("organization_id", organizationId)
        .in("status", ["active", "pending_invitation"]);

      if (error) {
        console.error("[hierarchyScope] load failed", error.message);
        return {
          mode: HIERARCHY_MODES.SELF,
          userIds: [userId],
          reason: "HIERARCHY_LOAD_FAILED_FAIL_CLOSED"
        };
      }
      rows = data || [];
    }
  } catch (error) {
    console.error("[hierarchyScope] load threw", error.message);
    return {
      mode: HIERARCHY_MODES.SELF,
      userIds: [userId],
      reason: "HIERARCHY_LOAD_FAILED_FAIL_CLOSED"
    };
  }

  const childrenByParent = buildChildrenByParent(rows);
  const descendants = collectDescendantIds(userId, childrenByParent);

  if (descendants.length === 0) {
    // No configured subtree — never expand to whole organization.
    return {
      mode: HIERARCHY_MODES.SELF,
      userIds: [userId],
      reason: "MISSING_HIERARCHY_FAIL_CLOSED"
    };
  }

  return {
    mode: HIERARCHY_MODES.SUBTREE,
    userIds: [userId, ...descendants],
    reason: "REPORTS_TO_SUBTREE"
  };
}

function prospectBelongsToScopedUsers(prospect, scopedUserIds) {
  if (!Array.isArray(scopedUserIds) || scopedUserIds.length === 0) {
    return false;
  }

  const allowed = new Set(scopedUserIds.map(String));
  const ownerUserId = prospect.owner_user_id || prospect.ownerUserId;
  const assignedAgentId = prospect.assigned_agent_id || prospect.assignedAgentId;
  const assignedRvpId = prospect.assigned_rvp_id || prospect.assignedRvpId;

  if (ownerUserId && allowed.has(String(ownerUserId))) {
    return true;
  }
  if (assignedAgentId && allowed.has(String(assignedAgentId))) {
    return true;
  }
  if (assignedRvpId && allowed.has(String(assignedRvpId))) {
    return true;
  }

  return false;
}

module.exports = {
  HIERARCHY_MODES,
  resolveHierarchyScopeForUser,
  collectDescendantIds,
  buildChildrenByParent,
  prospectBelongsToScopedUsers
};
