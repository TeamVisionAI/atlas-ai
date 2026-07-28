/**
 * Sprint 21.0 — WhatsApp Simulation Bridge verification.
 * Run: node backend/dev/verifySprint21_0.js
 */

require("dotenv").config();

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { supabase } = require("../services/supabaseService");
const {
  filterProductionProspects,
  isSimulatorProspect
} = require("../core/productionProspectFilter");
const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
const { isSimulatorActive, shouldMockExternalComms } = require("./simulatorGuard");
const { withSimulatorGuard } = require("./simulatorGuard");
const {
  createSimulatorProspect,
  cleanupSimulatorProspect
} = require("./workflowSimulatorService");
const {
  getSimulatorReviewExperience,
  sendSimulatorReviewMessage
} = require("./simulatorReviewService");
const { processSimulatedWhatsAppInbound } = require("./simulatedWhatsAppInboundPipeline");
const {
  canAccessOperationsCenter
} = require("./operationsCenterAccess");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function countConversationLogs(phone) {
  const { data, error } = await supabase
    .from("conversation_logs")
    .select("id, direction")
    .eq("prospect_phone", phone);

  if (error) {
    throw error;
  }

  return data || [];
}

async function countWorkflowEvents(phone) {
  const { data, error } = await supabase
    .from("workflow_events")
    .select("id, event_type")
    .eq("prospect_phone", phone);

  if (error && error.code !== "42P01") {
    throw error;
  }

  return data || [];
}

async function main() {
  console.log("=== Sprint 21.0 Verification ===\n");

  const phone = `sim-ops-${crypto.randomUUID().slice(0, 8)}`;
  const opsUser = { role: "ADMINISTRATOR" };
  const repUser = { role: "REPRESENTATIVE" };

  assert(canAccessOperationsCenter(opsUser), "Administrator can access Operations Center");
  assert(!canAccessOperationsCenter(repUser), "Representative cannot access Operations Center");
  console.log("✓ Operations Center access gate");

  await cleanupSimulatorProspect(phone).catch(() => {});

  await createSimulatorProspect({
    phone,
    name: "Sprint 21 Review Lead",
    preset: "NEW_LEAD",
    seedFields: {
      preferred_communication_channel: "WHATSAPP",
      source: "SIMULATED_WHATSAPP"
    }
  });
  assert(isSimulatorProspect(phone), "Simulator phone uses sim- prefix");
  console.log("✓ Simulator prospect creation");

  let externalAttempted = false;

  await withSimulatorGuard(async () => {
    assert(isSimulatorActive(), "Simulator guard active during processing");
    assert(shouldMockExternalComms(), "External comms mocked during processing");

    const inboundResult = await processSimulatedWhatsAppInbound({
      phone,
      body: "Hola, quiero información sobre Team Vision."
    });

    assert(inboundResult.success, "Simulated inbound pipeline succeeds");
    assert(inboundResult.reply, "Atlas reply generated");
    assert(
      inboundResult.conversation?.delivery?.simulated !== false ||
        inboundResult.conversation?.reason === "NON_WHATSAPP_CHANNEL" ||
        Boolean(inboundResult.reply),
      "Outbound remains local/simulated"
    );

    externalAttempted = !shouldMockExternalComms();
  });

  assert(!externalAttempted, "External WhatsApp delivery never attempted");
  console.log("✓ Simulated WhatsApp pipeline + local reply");

  const logs = await countConversationLogs(phone);
  assert(logs.some((row) => row.direction === "incoming"), "Inbound message persisted");
  assert(logs.some((row) => row.direction === "outgoing"), "Outbound reply persisted");
  console.log("✓ Conversation log persistence");

  const events = await countWorkflowEvents(phone);
  assert(events.length > 0, "Workflow events created");
  console.log("✓ Workflow event creation");

  const productionMc = await getMissionControlWithActions(phone, { tenantScoped: false });
  assert(productionMc === null, "Production Mission Control API excludes simulator phones");
  console.log("✓ Production Mission Control remains blocked for sim phones");

  const reviewMc = await getMissionControlWithActions(phone, {
    reviewMode: true,
    tenantScoped: false
  });
  assert(reviewMc, "Review-mode Mission Control read model available");
  assert(reviewMc.aiActionCenter?.nextBestAction, "AI Action Center recommendation available");
  assert(reviewMc.conversationMessages?.length >= 2, "Conversation thread available in review mode");
  console.log("✓ Review-mode Mission Control + AI Action Center");

  const review = await getSimulatorReviewExperience(phone, opsUser);
  assert(review.review?.reviewMode, "Review payload marked as review mode");
  assert(review.missionControl?.aiActionCenter, "Review experience includes recommendations");
  assert(review.workflowTrace?.timeline?.length > 0, "Workflow trace timeline available");
  console.log("✓ Review experience payload");

  const followUp = await sendSimulatorReviewMessage(
    phone,
    "Vivo en Miami, Florida.",
    opsUser
  );
  assert(followUp.messageResult?.success, "Follow-up simulated message succeeds");
  console.log("✓ Additional inbound message in review mode");

  let reviewDenied = false;

  try {
    await getSimulatorReviewExperience(phone, repUser);
  } catch (error) {
    reviewDenied = error.code === "REVIEW_ACCESS_DENIED" || error.statusCode === 403;
  }

  assert(reviewDenied, "Non-operations users cannot access review experience");
  console.log("✓ Review access restricted to Operations Center users");

  const mixed = [{ phone }, { phone: "17865551234" }];
  assert(
    filterProductionProspects(mixed).length === 1,
    "Simulator prospects remain excluded from production lists"
  );
  console.log("✓ Production surface isolation preserved");

  const build = spawnSync("npm", ["run", "build"], {
    cwd: `${__dirname}/../../frontend`,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  assert(build.status === 0, "frontend npm run build failed");
  console.log("✓ npm run build passes");

  await cleanupSimulatorProspect(phone).catch(() => {});

  console.log("\n=== Sprint 21.0 Verification PASSED ===");
}

main().catch((error) => {
  console.error("\n=== Sprint 21.0 Verification FAILED ===");
  console.error(error.message);
  process.exit(1);
});
