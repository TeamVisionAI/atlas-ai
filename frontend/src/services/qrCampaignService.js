import { apiFetch, apiRequest } from "./apiClient";

export async function fetchQrCampaignMeta() {
  return apiFetch("/api/qr-campaigns/meta");
}

export async function fetchQrCampaigns() {
  return apiFetch("/api/qr-campaigns");
}

export async function createQrCampaign(payload) {
  return apiFetch("/api/qr-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchQrCampaign(id) {
  return apiFetch(`/api/qr-campaigns/${id}`);
}

export async function activateQrCampaign(id) {
  return apiFetch(`/api/qr-campaigns/${id}/activate`, { method: "POST" });
}

export async function deactivateQrCampaign(id) {
  return apiFetch(`/api/qr-campaigns/${id}/deactivate`, { method: "POST" });
}

export async function fetchQrCampaignPublicUrl(id) {
  return apiFetch(`/api/qr-campaigns/${id}/public-url`);
}

async function downloadBinary(path, filename) {
  const response = await apiRequest(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(
      payload.message || payload.error || `Download failed (${response.status})`
    );
    error.status = response.status;
    error.code = payload.error || null;
    throw error;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadQrCampaignPng(id) {
  return downloadBinary(`/api/qr-campaigns/${id}/qr.png`, `atlas-qr-${id}.png`);
}

export async function downloadQrCampaignSvg(id) {
  return downloadBinary(`/api/qr-campaigns/${id}/qr.svg`, `atlas-qr-${id}.svg`);
}

export async function fetchQrCampaignPngObjectUrl(id) {
  const response = await apiRequest(`/api/qr-campaigns/${id}/qr.png`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(
      payload.message || payload.error || `Preview failed (${response.status})`
    );
    error.status = response.status;
    error.code = payload.error || null;
    throw error;
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
