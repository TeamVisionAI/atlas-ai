import { getAuthHeaders } from "./atlasAuthService";
import { apiRequest } from "./apiClient";

async function operationsFetch(path, options = {}) {
  const headers = {
    ...(await getAuthHeaders()),
    ...(options.headers || {})
  };

  const response = await apiRequest(`/api/operations${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message || payload.error || response.statusText;
    throw new Error(message);
  }

  return payload;
}

export async function fetchOperationsAccess() {
  return operationsFetch("/access");
}

export async function fetchSystemHealth() {
  return operationsFetch("/health/system");
}

export async function fetchSmokeTests() {
  return operationsFetch("/smoke-tests");
}

export async function runSmokeTest(testId) {
  return operationsFetch(`/smoke-tests/${encodeURIComponent(testId)}`, {
    method: "POST"
  });
}

export async function replayAllProjections() {
  return operationsFetch("/replay/all", { method: "POST" });
}

export async function replaySingleProspect(prospectId) {
  return operationsFetch("/replay/prospect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prospectId })
  });
}

export async function resetProjectionState() {
  return operationsFetch("/replay/reset", { method: "POST" });
}

export async function rebuildMissionControl() {
  return operationsFetch("/replay/mission-control", { method: "POST" });
}

export async function rebuildExecutiveDashboard() {
  return operationsFetch("/replay/executive-dashboard", { method: "POST" });
}

export async function fetchBusinessEvents(query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return operationsFetch(`/business-events${suffix}`);
}

export async function fetchBusinessEventById(id) {
  return operationsFetch(`/business-events/${encodeURIComponent(id)}`);
}

export async function fetchProspectTimeline(prospectId) {
  return operationsFetch(`/timeline/${encodeURIComponent(prospectId)}`);
}

export async function fetchDiagnostics() {
  return operationsFetch("/logs/diagnostics");
}

export async function fetchSimulatorScenarios() {
  return operationsFetch("/simulator/scenarios");
}

export async function runAllSimulatorScenarios() {
  return operationsFetch("/simulator/scenarios/run-all", { method: "POST" });
}

export async function runSimulatorScenario(scenarioId) {
  return operationsFetch(`/simulator/scenarios/${encodeURIComponent(scenarioId)}/run`, {
    method: "POST"
  });
}

export async function simulateFacebookLead(payload = {}) {
  return operationsFetch("/simulator/facebook-lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function simulateWebsiteLead(payload = {}) {
  return operationsFetch("/simulator/website-lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function simulateWhatsAppConversation(payload = {}) {
  return operationsFetch("/simulator/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchWorkflowSimulatorState(phone) {
  return operationsFetch(`/simulator/workflow/state/${encodeURIComponent(phone)}`);
}

export async function advanceWorkflowSimulator(body) {
  return operationsFetch("/simulator/workflow/advance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function fetchWorkflowSimulatorEvents(phone) {
  return operationsFetch(`/simulator/workflow/events/${encodeURIComponent(phone)}`);
}

export async function fetchWorkflowSimulatorTimeline(phone) {
  return operationsFetch(`/simulator/workflow/timeline/${encodeURIComponent(phone)}`);
}
