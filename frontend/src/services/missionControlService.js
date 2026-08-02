import { apiFetch, apiRequest } from "./apiClient";

export class MissionControlError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = "MissionControlError";
    this.status = status;
    this.code = code;
  }
}

export function isMissionControlAccessDenied(error) {
  return error instanceof MissionControlError && error.status === 403;
}

/**
 * @param {string} [phone]
 * @returns {Promise<import("../types/missionControl").MissionControlResponse | null>}
 */
export async function getMissionControl(phone) {
  const segment = phone ? encodeURIComponent(phone) : "latest";
  const response = await apiRequest(`/api/mission-control/${segment}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new MissionControlError(
      payload.message || "Failed to load mission control",
      response.status,
      payload.error || null
    );
  }

  return response.json();
}

/**
 * @param {string} phone
 * @param {string} action
 * @param {Object} [payload]
 * @returns {Promise<import("../types/missionControl").MissionControlActionResult>}
 */
export async function postMissionControlAction(phone, action, payload = {}) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload })
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to execute mission control action", response.status);
  }

  return result;
}

/**
 * @param {string} phone
 * @param {Object} workflowState
 */
export async function syncMissionControlWorkflow(phone, workflowState) {
  return apiFetch(`/api/mission-control/${encodeURIComponent(phone)}/workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflowState)
  });
}

/**
 * @param {string} phone
 * @param {Object} body — BR-035 advancement payload
 */
export async function advanceMissionControlWorkflow(phone, body) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/workflow/advance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to advance workflow", response.status);
  }

  return result;
}

/**
 * Save required prospect information without a conversation outcome.
 * @param {string} phone
 * @param {{ fields: Object }} body
 */
export async function saveRequiredInformation(phone, body) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/required-information`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to save required information", response.status);
  }

  return result;
}

/**
 * W-006 — Save conversation outcome and refresh Mission Control payload.
 * @param {string} phone
 * @param {{ outcome: string, fields?: Object, interactionNotes?: string }} body
 */
export async function saveConversationOutcome(phone, body) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/conversation-outcome`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to save conversation outcome", response.status);
  }

  return result;
}

/**
 * Interview Outcome Engine — save outcome, advance workflow, refresh Mission Control.
 * @param {string} phone
 * @param {{ outcome: string, fields?: Object, followUpRecommendation?: Object, interactionNotes?: string }} body
 */
export async function saveInterviewOutcome(phone, body) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/interview-outcome`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to save interview outcome", response.status);
  }

  return result;
}

/**
 * Sprint 18.2 — Request suggested availability slots from Mission Control.
 * @param {string} phone
 * @param {{ date?: string, duration?: number, appointmentType?: string }} [params]
 */
export async function fetchMissionControlAvailability(phone, params = {}) {
  const query = new URLSearchParams();

  if (params.date) {
    query.set("date", params.date);
  }

  if (params.duration) {
    query.set("duration", String(params.duration));
  }

  if (params.appointmentType) {
    query.set("appointmentType", params.appointmentType);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/api/mission-control/${encodeURIComponent(phone)}/availability${suffix}`);
}

/**
 * Preview a WhatsApp message for copy+open workflow.
 * @param {string} phone
 * @param {{ template?: string, sourceAction?: string }} [params]
 */
export async function getWhatsAppCommunicationPreview(phone, params = {}) {
  const query = new URLSearchParams();

  if (params.template) {
    query.set("template", params.template);
  }

  if (params.sourceAction) {
    query.set("sourceAction", params.sourceAction);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/communication/preview${suffix}`
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to preview WhatsApp message", response.status);
  }

  return result;
}

/**
 * Record a copy+open WhatsApp send (sets workflow flags, logs timeline).
 * @param {string} phone
 * @param {{ template?: string, sourceAction?: string, deliveryMode?: string }} body
 */
export async function postWhatsAppCommunicationSend(phone, body = {}) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/communication/send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to record WhatsApp send", response.status);
  }

  return result;
}
