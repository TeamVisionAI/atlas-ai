/**
 * Super Admin tenant console display helpers.
 * Display-only — does not change isolation, billing, or invitation sending.
 */

import { filterTenantsByLifecycle } from "./platformBillingHelpers.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TENANTS_PAGE_SIZE = 25;
export const USERS_PAGE_SIZE = 25;

export function isRawUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function formatOwnerShortName(admin = null) {
  const first = String(admin?.firstName || "").trim();
  const last = String(admin?.lastName || "").trim();

  if (first && last) {
    return `${first} ${last.charAt(0).toUpperCase()}.`;
  }

  const display = String(admin?.displayName || "").trim();
  if (display) {
    const parts = display.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
    }
    return display;
  }

  return String(admin?.email || "").trim();
}

export function ownerAdminLabel(tenant) {
  const admin = tenant?.firstAdmin;
  if (admin) {
    const name = formatOwnerShortName(admin);
    const pending =
      admin.invitationPending === true || admin.status === "pending_invitation";
    if (pending) {
      return name ? `${name} · Pending` : "Pending";
    }
    return name || "Assigned";
  }

  if (tenant?.hasFirstAdmin || tenant?.ownerUserId) {
    return "Assigned";
  }

  return "—";
}

export function ownerAdminEmail(tenant) {
  const email = String(tenant?.firstAdmin?.email || "").trim();
  return email && !isRawUuid(email) ? email : "";
}

export function canAssignFirstAdmin(tenant) {
  if (!tenant) {
    return false;
  }

  if (tenant.hasFirstAdmin === true || tenant.firstAdmin?.id) {
    return false;
  }

  if (tenant.ownerUserId && !isRawUuid(tenant.ownerUserId)) {
    return false;
  }

  return !tenant.ownerUserId;
}

export function filterTenantsForConsole(
  tenants = [],
  { query = "", lifecycleFilter = "ALL" } = {}
) {
  const byLifecycle = filterTenantsByLifecycle(tenants, lifecycleFilter);
  const needle = String(query || "").trim().toLowerCase();

  if (!needle) {
    return byLifecycle;
  }

  return byLifecycle.filter((tenant) => {
    const haystack = [
      tenant.name,
      tenant.slug,
      tenant.firstAdmin?.displayName,
      tenant.firstAdmin?.firstName,
      tenant.firstAdmin?.lastName,
      tenant.firstAdmin?.email
    ]
      .map((part) => String(part || "").toLowerCase())
      .join(" ");

    return haystack.includes(needle);
  });
}

export function paginateItems(items = [], page = 1, pageSize = TENANTS_PAGE_SIZE) {
  const size = Math.max(1, Number(pageSize) || TENANTS_PAGE_SIZE);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (safePage - 1) * size;

  return {
    page: safePage,
    pageCount,
    total,
    items: items.slice(start, start + size)
  };
}
