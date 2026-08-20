import { isSuperAdminUser } from "./isSuperAdminUser.js";

export { isSuperAdminUser };

export const TENANT_LIFECYCLE_STATUSES = Object.freeze([
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED"
]);
export const DEFAULT_CREATE_TENANT_STATUS = "TRIAL";

export function shouldShowPlatformNav(user) {
  return isSuperAdminUser(user);
}

export function canAccessPlatformTenantsPage(user) {
  return isSuperAdminUser(user);
}

export function isTenantSuspended(tenant) {
  return String(tenant?.lifecycleStatus || tenant?.status || "")
    .trim()
    .toUpperCase() === "SUSPENDED";
}

export function canEnterSupportMode(tenant) {
  return Boolean(tenant?.id) && !isTenantSuspended(tenant);
}

export function requiresSuspendConfirmation(status) {
  return String(status || "").trim().toUpperCase() === "SUSPENDED";
}

export function requiresReactivateConfirmation(currentStatus, nextStatus) {
  const current = String(currentStatus || "").trim().toUpperCase();
  const next = String(nextStatus || "").trim().toUpperCase();

  return current === "SUSPENDED" && next && next !== "SUSPENDED";
}

export function shouldConfirmSupportModeSwitch(supportMode, targetOrganizationId) {
  if (!supportMode?.active || !supportMode.organizationId || !targetOrganizationId) {
    return false;
  }

  return String(supportMode.organizationId) !== String(targetOrganizationId);
}

export function isSupportModeBannerVisible(supportMode) {
  return supportMode?.active === true;
}

export function supportModeBannerLabel(supportMode) {
  const name = supportMode?.organizationName || "Unknown tenant";
  return `SUPPORT MODE — ${name}`;
}

export function buildCreateTenantPayload({ name, slug, status } = {}) {
  const payload = {
    name: String(name || "").trim(),
    status: String(status || DEFAULT_CREATE_TENANT_STATUS).trim().toUpperCase() || DEFAULT_CREATE_TENANT_STATUS
  };

  const normalizedSlug = String(slug || "").trim().toLowerCase();

  if (normalizedSlug) {
    payload.slug = normalizedSlug;
  }

  return payload;
}

export function buildUpdateTenantStatusPayload(status) {
  return { lifecycleStatus: String(status || "").trim().toUpperCase() };
}

export function buildAssignTenantAdminPayload({ firstName, lastName, email } = {}) {
  return {
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim(),
    email: String(email || "").trim().toLowerCase()
  };
}

export function assignTenantAdminPath(tenantId) {
  return `/api/platform/tenants/${tenantId}/admin`;
}

export function tenantAdminPayloadOmitsOrganizationId(payload) {
  return (
    payload &&
    !Object.prototype.hasOwnProperty.call(payload, "organizationId") &&
    !Object.prototype.hasOwnProperty.call(payload, "organization_id")
  );
}

export function buildEnterSupportModePayload(organizationId) {
  return { organizationId };
}

export function tenantWorkspaceMustNotOverrideOrganizationId(request = {}) {
  const query = request.query || {};
  const body = request.body || {};
  const search = String(request.search || request.url || "");

  return (
    !query.organizationId &&
    !query.organization_id &&
    !body.organizationId &&
    !body.organization_id &&
    !/[?&]organizationId=/.test(search) &&
    !/[?&]organization_id=/.test(search)
  );
}
