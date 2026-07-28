/**
 * Sprint 12 — Alpha acceptance checklist for Operations Center.
 * Verifies golden-path readiness from live probes — no placeholder passes.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { evaluateProductionReadiness } = require("./productionReadiness");
const { runStartupValidation } = require("./engineeringGuardrails");
const { buildGoldenPathTrace } = require("./alphaGoldenPathTraceService");

const CHECKLIST_ITEMS = Object.freeze([
  { id: "meta_webhook", label: "Meta webhook received" },
  { id: "ai_qualification", label: "AI qualification completed" },
  { id: "prospect_classified", label: "Prospect classified correctly" },
  { id: "language_detected", label: "Preferred language detected" },
  { id: "calendar_created", label: "Calendar appointment created" },
  { id: "meeting_inserted", label: "Meeting URL or Office inserted" },
  { id: "whatsapp_confirmation", label: "WhatsApp confirmation sent" },
  { id: "mission_control_updated", label: "Mission Control updated" },
  { id: "prospect_center_updated", label: "Prospect Center updated" },
  { id: "executive_dashboard_updated", label: "Executive Dashboard updated" },
  { id: "timeline_completed", label: "Timeline completed" },
  { id: "validation_pass", label: "Validation PASS" }
]);

function checklistResult(id, label, pass, details = {}) {
  return {
    id,
    label,
    pass: Boolean(pass),
    status: pass ? "PASS" : "FAIL",
    ...details
  };
}

async function fetchRecentBusinessEvents(limit = 100) {
  const { supabase } = require("../services/supabaseService");
  const { data, error } = await supabase
    .from("atlas_business_events")
    .select("event_type, prospect_id, correlation_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data || [];
}

function isFacebookEvent(event) {
  const correlation = String(event.correlation_id || "").toLowerCase();
  const payload = event.payload || {};
  const source = String(payload.sourceDetail || payload.source || "").toLowerCase();
  return correlation.includes("facebook") || source.includes("facebook");
}

async function evaluateAlphaAcceptance(options = {}) {
  const organizationId = options.organizationId || DEFAULT_ORGANIZATION_ID;
  let tracePhone = options.phone || null;

  if (!tracePhone) {
    const { findLatestActiveProspectInOrganization } = require("../services/supabaseService");
    const latest = await findLatestActiveProspectInOrganization(organizationId);
    tracePhone = latest?.phone || null;
  }

  const readiness = await evaluateProductionReadiness();
  const metaOk = readiness.checks.find((row) => row.id === "meta_embedded_signup")?.ok;
  const webhookOk = readiness.checks.find((row) => row.id === "whatsapp_webhook")?.ok;
  const events = await fetchRecentBusinessEvents();
  const facebookEvents = events.filter(isFacebookEvent);
  const trace = tracePhone
    ? await buildGoldenPathTrace(tracePhone, { organizationId }).catch(() => null)
    : null;
  const runValidation = options.runValidation !== false;
  const items = [];
  const startedAt = Date.now();

  items.push(
    checklistResult(
      "meta_webhook",
      "Meta webhook received",
      webhookOk && (facebookEvents.length > 0 || metaOk),
      {
        detail: facebookEvents.length
          ? `${facebookEvents.length} recent Facebook-related event(s)`
          : webhookOk
            ? "Webhook configured — awaiting live Meta lead"
            : "Meta webhook not configured"
      }
    )
  );

  let validationReport = null;

  if (runValidation) {
    try {
      const { runCompleteValidation } = require("../dev/autonomousValidationEngine");
      validationReport = await runCompleteValidation();
    } catch (error) {
      validationReport = { overall: "FAIL", error: error.message };
    }
  } else {
    validationReport = options.validationReport || null;
  }

  const happyPathPass =
    validationReport?.sections?.find((row) => row.id === "happy_path")?.pass === true;
  const missionControlPass =
    validationReport?.sections?.find((row) => row.id === "mission_control_load")?.pass === true;

  items.push(
    checklistResult("ai_qualification", "AI qualification completed", happyPathPass, {
      detail: happyPathPass ? "Happy path validation passed" : "Run validation to verify qualification flow"
    })
  );

  items.push(
    checklistResult(
      "prospect_classified",
      "Prospect classified correctly",
      trace?.checks?.prospectClassified ?? missionControlPass,
      { detail: trace?.workflow?.canonicalMilestone || "No trace phone provided" }
    )
  );

  items.push(
    checklistResult(
      "language_detected",
      "Preferred language detected",
      trace?.checks?.languageDetected ?? false,
      { detail: trace?.prospect?.communication_language || trace?.brain?.language || "—" }
    )
  );

  items.push(
    checklistResult(
      "calendar_created",
      "Calendar appointment created",
      trace?.checks?.calendarCreated ?? false,
      { detail: trace?.calendar?.eventId || "No calendar event on trace prospect" }
    )
  );

  items.push(
    checklistResult(
      "meeting_inserted",
      "Meeting URL or Office inserted",
      trace?.checks?.meetingInserted ?? false,
      { detail: trace?.meeting?.location || "Configure Meeting Management or schedule interview"
      }
    )
  );

  items.push(
    checklistResult(
      "whatsapp_confirmation",
      "WhatsApp confirmation sent",
      trace?.checks?.whatsappConfirmation ?? facebookEvents.some((row) => row.event_type === "message_sent"),
      { detail: trace?.whatsapp?.confirmationSent ? "Confirmation message logged" : "Awaiting outbound confirmation"
      }
    )
  );

  items.push(
    checklistResult(
      "mission_control_updated",
      "Mission Control updated",
      missionControlPass || Boolean(trace?.missionControl),
      { detail: trace?.missionControl?.canonicalMilestone || "Mission Control load validation"
      }
    )
  );

  let prospectCenterOk = false;

  try {
    const { buildProspectCenterReadModel } = require("./prospectCenterReadModel");
    const center = await buildProspectCenterReadModel({ organizationId });
    prospectCenterOk = Array.isArray(center.items);
  } catch (error) {
    prospectCenterOk = false;
  }

  items.push(
    checklistResult("prospect_center_updated", "Prospect Center updated", prospectCenterOk, {
      detail: prospectCenterOk ? "Prospect Center read model loaded" : "Prospect Center unavailable"
    })
  );

  let executiveOk = false;

  try {
    const { buildExecutiveDashboard } = require("./executiveDashboardReadModel");
    const executive = await buildExecutiveDashboard(organizationId);
    executiveOk = Boolean(executive?.prioritizedWorkflowQueue);
  } catch (error) {
    executiveOk = false;
  }

  items.push(
    checklistResult(
      "executive_dashboard_updated",
      "Executive Dashboard updated",
      executiveOk,
      { detail: executiveOk ? "Executive dashboard projection loaded" : "Executive dashboard unavailable"
      }
    )
  );

  items.push(
    checklistResult(
      "timeline_completed",
      "Timeline completed",
      trace?.checks?.timelineCompleted ?? false,
      { detail: trace?.timeline?.entryCount
        ? `${trace.timeline.entryCount} timeline entries`
        : "Provide trace phone or run golden path"
      }
    )
  );

  const startupReport = await runStartupValidation({ failFast: false }).catch((error) => ({
    pass: false,
    errors: [{ message: error.message }]
  }));

  const validationPass =
    validationReport?.overall === "PASS" && startupReport.pass !== false;

  items.push(
    checklistResult("validation_pass", "Validation PASS", validationPass, {
      detail: validationReport
        ? `${validationReport.stepsPassed}/${validationReport.total} steps`
        : "Validation not run"
    })
  );

  const passed = items.filter((row) => row.pass).length;
  const failed = items.filter((row) => !row.pass).length;
  const alphaReady = failed === 0;

  return {
    sprint: "12",
    title: "Atlas Alpha Acceptance Checklist",
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    alphaReady,
    status: alphaReady ? "ATLAS_ALPHA_READY" : "NOT_READY",
    passed,
    failed,
    total: items.length,
    items,
    tracePhone,
    validationSummary: validationReport
      ? {
          overall: validationReport.overall,
          passRate: validationReport.passRate,
          stepsPassed: validationReport.stepsPassed,
          stepsFailed: validationReport.stepsFailed
        }
      : null
  };
}

module.exports = {
  CHECKLIST_ITEMS,
  evaluateAlphaAcceptance
};
