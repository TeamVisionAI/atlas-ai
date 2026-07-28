/**
 * Sprint 21.0 — Simulator review experience (Operations Center only).
 * Exposes production read models for sim- prospects without weakening production filters.
 */

const { assertSimulatorPhone, isSimulatorPhone } = require("./simulatorSafety");
const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
const {
  composeProspectWorkspaceFromMissionControl,
  buildProspectIdentity
} = require("../core/prospectWorkspaceReadModel");
const { findProspect } = require("../services/supabaseService");
const { listWorkflowEvents } = require("../services/workflowEventService");
const { getConversationTimeline } = require("../services/timelineService");
const { processSimulatedWhatsAppInbound } = require("./simulatedWhatsAppInboundPipeline");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const { canAccessOperationsCenter } = require("./operationsCenterAccess");

function assertReviewAccess(user) {
  if (!canAccessOperationsCenter(user)) {
    const error = new Error("Operations Center access required for simulator review.");
    error.statusCode = 403;
    error.code = "REVIEW_ACCESS_DENIED";
    throw error;
  }
}

function buildReviewMeta(phone) {
  return {
    reviewMode: true,
    simulated: true,
    phone,
    disclaimer:
      "Simulated for App Review / Developer Testing. This is not a real Meta WhatsApp message.",
    badgeLabel: "Simulated WhatsApp"
  };
}

async function buildSimulatorReviewWorkspace(phone, missionControl) {
  const prospectRow = await findProspect(phone);
  const prospect = buildProspectIdentity(prospectRow || missionControl.prospect);

  const workspace = await composeProspectWorkspaceFromMissionControl(
    phone,
    missionControl,
    prospectRow?.organization_id || null
  );

  return {
    ...workspace,
    prospect: {
      ...workspace.prospect,
      ...prospect,
      isSimulator: true
    }
  };
}

async function buildWorkflowTrace(phone, latestTrace = []) {
  const [events, messages] = await Promise.all([
    listWorkflowEvents(phone, 50),
    getConversationTimeline(phone)
  ]);

  const eventSummaries = events.map((row) => ({
    timestamp: row.created_at,
    kind: "workflow_event",
    label: row.event_type,
    summary: row.event_type,
    ownershipAfter: row.ownership_after || null
  }));

  const messageSummaries = messages.map((row) => ({
    timestamp: row.created_at,
    kind: "message",
    label: row.direction === "incoming" ? "Message received" : "Reply generated",
    summary: String(row.message || "").slice(0, 160),
    direction: row.direction
  }));

  const merged = [...messageSummaries, ...eventSummaries].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)
  );

  return {
    pipelineSteps: latestTrace,
    timeline: merged
  };
}

async function getSimulatorReviewExperience(phone, user) {
  assertReviewAccess(user);
  assertSimulatorPhone(phone);

  const missionControl = await getMissionControlWithActions(phone, {
    reviewMode: true,
    tenantScoped: false
  });

  if (!missionControl) {
    const error = new Error("Simulator prospect not found.");
    error.statusCode = 404;
    throw error;
  }

  const workspace = await buildSimulatorReviewWorkspace(phone, missionControl);
  const workflowTrace = await buildWorkflowTrace(phone);

  return {
    success: true,
    review: buildReviewMeta(phone),
    missionControl,
    workspace,
    workflowTrace
  };
}

async function sendSimulatorReviewMessage(phone, body, user) {
  assertReviewAccess(user);
  assertSimulatorPhone(phone);

  const text = String(body || "").trim();

  if (!text) {
    const error = new Error("Message body is required.");
    error.statusCode = 400;
    error.code = "BODY_REQUIRED";
    throw error;
  }

  const result = await processSimulatedWhatsAppInbound({
    phone,
    body: text
  });

  const experience = await getSimulatorReviewExperience(phone, user);

  return {
    ...experience,
    messageResult: {
      success: result.success,
      skipped: result.skipped,
      reply: result.reply,
      trace: result.trace
    }
  };
}

function verifySimulatorExcludedFromProduction(prospects = []) {
  const productionOnly = filterProductionProspects(prospects);
  return productionOnly.every((row) => !isSimulatorPhone(row?.phone));
}

module.exports = {
  assertReviewAccess,
  buildReviewMeta,
  getSimulatorReviewExperience,
  sendSimulatorReviewMessage,
  verifySimulatorExcludedFromProduction
};
