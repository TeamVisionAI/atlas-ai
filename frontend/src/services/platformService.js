import { apiFetch } from "./apiClient";
import {
  assignTenantAdminPath,
  buildAssignTenantAdminPayload,
  buildCreateTenantPayload,
  buildEnterSupportModePayload,
  buildUpdateTenantStatusPayload
} from "../security/platformAccess";

export async function listTenants(query = {}) {
  const params = new URLSearchParams();
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.limit) {
    params.set("limit", String(query.limit));
  }
  if (query.offset) {
    params.set("offset", String(query.offset));
  }
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch(`/api/platform/tenants${suffix}`);
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

export async function getTenantBilling(id) {
  return apiFetch(`/api/platform/tenants/${id}/billing`);
}

export async function getTenantFeatures(id) {
  return apiFetch(`/api/platform/tenants/${id}/features`);
}

export async function getTenantRecruitAiV2(id) {
  return apiFetch(`/api/platform/tenants/${id}/recruit-ai-v2`);
}

export async function updateTenantRecruitAiV2(id, payload) {
  return apiFetch(`/api/platform/tenants/${id}/recruit-ai-v2`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}

export async function updateTenantFeatures(id, payload) {
  return apiFetch(`/api/platform/tenants/${id}/features`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
}


export async function updateTenantBilling(id, payload) {
  return apiFetch(`/api/platform/tenants/${id}/billing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function extendTenantTrial(id, payload) {
  return apiFetch(`/api/platform/tenants/${id}/billing/extend-trial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function markTenantPaid(id, payload) {
  return apiFetch(`/api/platform/tenants/${id}/billing/mark-paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function getAiQualitySettings() {
  return apiFetch("/api/platform/ai-quality/settings");
}

export async function getAiQualityOverview(query = {}) {
  const params = new URLSearchParams();
  if (query.organizationId) {
    params.set("organizationId", query.organizationId);
  }
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch(`/api/platform/ai-quality/overview${suffix}`);
}

export async function listAiQualityCases(query = {}) {
  const params = new URLSearchParams();
  if (query.organizationId) {
    params.set("organizationId", query.organizationId);
  }
  if (query.tab) {
    params.set("tab", query.tab);
  }
  if (query.signalType) {
    params.set("signalType", query.signalType);
  }
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch(`/api/platform/ai-quality/cases${suffix}`);
}

export async function getAiQualityCase(id) {
  return apiFetch(`/api/platform/ai-quality/cases/${id}`);
}

export async function reviewAiQualityCase(id, payload) {
  return apiFetch(`/api/platform/ai-quality/cases/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function listAiQualityRegressions(query = {}) {
  const params = new URLSearchParams();
  if (query.organizationId) {
    params.set("organizationId", query.organizationId);
  }
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch(`/api/platform/ai-quality/regressions${suffix}`);
}

export async function getAiQualityRegressionSpec(id) {
  return apiFetch(`/api/platform/ai-quality/regressions/${id}/spec`);
}

export async function getAiQualityLearningReport(query = {}) {
  const params = new URLSearchParams();
  if (query.organizationId) {
    params.set("organizationId", query.organizationId);
  }
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch(`/api/platform/ai-quality/learning-report${suffix}`);
}

export async function applyAiQualityLearningAction(id, payload) {
  return apiFetch(`/api/platform/ai-quality/cases/${id}/learning-actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
