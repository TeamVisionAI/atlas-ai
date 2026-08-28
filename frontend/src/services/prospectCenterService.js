/**
 * Sprint 10.3 — Prospect Center API client.
 */

import { apiFetch, apiRequest } from "./apiClient";

export class ProspectCenterError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProspectCenterError";
    this.status = status;
  }
}

/**
 * @param {{ filter?: string, search?: string }} [options]
 */
export async function getProspectCenter(options = {}) {
  const params = new URLSearchParams();

  if (options.filter && options.filter !== "all") {
    params.set("filter", options.filter);
  }

  if (options.search) {
    params.set("q", options.search);
  }

  if (options.workspaceScope) {
    params.set("workspaceScope", options.workspaceScope);
  }

  const query = params.toString();

  try {
    return await apiFetch(`/api/prospect-center${query ? `?${query}` : ""}`);
  } catch (error) {
    const match = error.message.match(/^API (\d+):/);
    throw new ProspectCenterError(
      "Failed to load prospect center",
      match ? Number(match[1]) : undefined
    );
  }
}

export async function acknowledgeProspectLead(phone) {
  return apiFetch(`/api/new-lead-attention/${encodeURIComponent(phone)}/acknowledge`, {
    method: "POST"
  });
}

export async function claimProspectLead(phone) {
  return apiFetch(`/api/new-lead-attention/${encodeURIComponent(phone)}/claim`, {
    method: "POST"
  });
}

function prospectReportQuery(options = {}) {
  const params = new URLSearchParams();
  const keys = [
    "lifecycle",
    "dateFrom",
    "dateTo",
    "ownerUserId",
    "milestone",
    "source",
    "appointmentStatus",
    "limit",
    "offset"
  ];

  for (const key of keys) {
    if (options[key] != null && options[key] !== "" && options[key] !== "all") {
      params.set(key, String(options[key]));
    }
  }

  if (options.export) {
    params.set("export", "1");
  }

  return params.toString();
}

export async function getProspectReport(options = {}) {
  const query = prospectReportQuery(options);

  try {
    return await apiFetch(`/api/prospect-center/report${query ? `?${query}` : ""}`);
  } catch (error) {
    const match = error.message.match(/^API (\d+):/);
    throw new ProspectCenterError(
      "Failed to load prospect report",
      match ? Number(match[1]) : undefined
    );
  }
}

export async function downloadProspectReportCsv(options = {}) {
  const query = prospectReportQuery({ ...options, export: true });
  const response = await apiRequest(`/api/prospect-center/report.csv${query ? `?${query}` : ""}`);

  if (!response.ok) {
    throw new ProspectCenterError("Failed to export prospect report", response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "atlas-prospect-report.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
