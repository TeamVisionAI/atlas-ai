import { apiFetch } from "./apiClient";
import {
  assignTenantAdminPath,
  buildAssignTenantAdminPayload,
  buildCreateTenantPayload,
  buildEnterSupportModePayload,
  buildUpdateTenantStatusPayload
} from "../security/platformAccess";

export async function listTenants() {
  return apiFetch("/api/platform/tenants");
}

export async function getTenant(id) {
  return apiFetch(`/api/platform/tenants/${id}`);
}

export async function createTenant(payload) {
  return apiFetch("/api/platform/tenants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCreateTenantPayload(payload))
  });
}

export async function updateTenantStatus(id, status) {
  return apiFetch(`/api/platform/tenants/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildUpdateTenantStatusPayload(status))
  });
}

export async function assignTenantAdmin(id, payload) {
  return apiFetch(assignTenantAdminPath(id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildAssignTenantAdminPayload(payload))
  });
}

export async function getSupportMode() {
  return apiFetch("/api/platform/support-mode");
}

export async function enterSupportMode(organizationId) {
  return apiFetch("/api/platform/support-mode/enter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildEnterSupportModePayload(organizationId))
  });
}

export async function exitSupportMode() {
  return apiFetch("/api/platform/support-mode/exit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}
