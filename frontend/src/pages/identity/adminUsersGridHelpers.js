/**
 * Administration — Users / Invitations grid helpers (display-only).
 * Tenant-neutral; no org hardcoding.
 */

export const USERS_DEFAULT_STATUS_FILTER = "active_and_pending";

export function displayUserName(user) {
  const name = String(user?.display_name || "").trim();
  if (name) {
    return name;
  }
  const parts = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return parts || user?.email || "—";
}

export function formatStatusLabel(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "pending_invitation" || value === "pending") {
    return "Pending";
  }
  if (value === "active") {
    return "Active";
  }
  if (value === "suspended") {
    return "Suspended";
  }
  if (value === "archived") {
    return "Archived";
  }
  if (value === "expired") {
    return "Expired";
  }
  if (value === "accepted") {
    return "Accepted";
  }
  if (!value) {
    return "—";
  }
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function invitationDisplayStatus(user) {
  if (user?.status === "pending_invitation") {
    return user.invitation?.status || "pending";
  }
  return user?.status || "";
}

export function statusBadgeClass(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "active" || value === "accepted") {
    return "admin-users-badge admin-users-badge--status-active";
  }
  if (value === "pending_invitation" || value === "pending") {
    return "admin-users-badge admin-users-badge--status-pending";
  }
  if (value === "suspended") {
    return "admin-users-badge admin-users-badge--status-suspended";
  }
  if (value === "archived" || value === "expired") {
    return "admin-users-badge admin-users-badge--status-archived";
  }
  return "admin-users-badge admin-users-badge--status-neutral";
}

/**
 * Client-side filters for the admin grid (API still loads tenant-scoped list).
 */
export function filterAdminUsers(users, { query = "", statusFilter = "", rankFilter = "", roleFilter = "" } = {}) {
  const needle = String(query || "").trim().toLowerCase();
  const status = String(statusFilter || "").trim();
  const rank = String(rankFilter || "").trim().toUpperCase();
  const role = String(roleFilter || "").trim().toLowerCase();

  return (users || []).filter((user) => {
    if (status === USERS_DEFAULT_STATUS_FILTER) {
      if (user.status !== "active" && user.status !== "pending_invitation") {
        return false;
      }
    } else if (status && user.status !== status) {
      return false;
    }

    if (rank && String(user.business_rank || "").toUpperCase() !== rank) {
      return false;
    }

    if (role && String(user.role || "").toLowerCase() !== role) {
      return false;
    }

    if (!needle) {
      return true;
    }

    const haystack = [
      user.display_name,
      user.first_name,
      user.last_name,
      user.email,
      user.rep_id
    ]
      .map((part) => String(part || "").toLowerCase())
      .join(" ");

    return haystack.includes(needle);
  });
}

export function buildUserRowActions(user, { canVerifySecurities = false, isSelf = false } = {}) {
  const status = user?.status;
  const actions = [];

  if (status === "pending_invitation") {
    actions.push({ id: "invite", label: "Resend Invite" });
    actions.push({ id: "revoke-invite", label: "Revoke Invite" });
    return actions;
  }

  actions.push({ id: "edit-rep", label: "Edit Rep ID" });
  actions.push({ id: "edit-capabilities", label: "Capabilities" });

  if (canVerifySecurities && !isSelf) {
    actions.push({ id: "edit-securities", label: "Edit Securities Access" });
  }

  if (status === "active") {
    actions.push({ id: "suspend", label: "Suspend" });
    actions.push({ id: "reset", label: "Force Reset" });
    actions.push({ id: "logout", label: "Force Logout" });
  }

  if (status === "suspended") {
    actions.push({ id: "reactivate", label: "Reactivate" });
    actions.push({ id: "reset", label: "Force Reset" });
  }

  if (status !== "archived") {
    actions.push({ id: "archive", label: "Archive" });
  }

  return actions;
}
