/**
 * Sprint 8A.2 — Local verification script (no production side effects beyond read path).
 * Run: node backend/dev/verifySprint8A2.js
 */

require("dotenv").config();

const { detectConversationStall } = require("../core/stallDetectionEngine");
const { normalizeOwnership, OWNERSHIP } = require("../core/workflowConstants");
const { getMissionControlWithActions } = require("../controllers/agentActionController");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=== Sprint 8A.2 Verification ===\n");

  assert(
    normalizeOwnership("SYSTEM_WAITING") === OWNERSHIP.WAITING_EVENT,
    "Legacy SYSTEM_WAITING should normalize to WAITING_EVENT"
  );
  console.log("✓ Ownership rename / normalization");

  const staleOutbound = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const stall = detectConversationStall({
    messageHints: { lastOutboundAt: staleOutbound, lastInboundAt: null },
    milestone: "QUALIFICATION",
    prospect: { current_step: "GREETING" },
    defaultOwnership: OWNERSHIP.ATLAS,
    agentState: {}
  });
  assert(stall.isStalled === true, "Expected stall for 25h silence");
  assert(stall.recommendedAction === "call", "Expected call recommendation");
  console.log("✓ Stall detection (25h silence)");

  const recentReply = detectConversationStall({
    messageHints: {
      lastOutboundAt: staleOutbound,
      lastInboundAt: new Date().toISOString()
    },
    milestone: "QUALIFICATION",
    prospect: {},
    defaultOwnership: OWNERSHIP.ATLAS,
    agentState: {}
  });
  assert(recentReply.isStalled === false && recentReply.cleared === true, "Expected clearance on reply");
  console.log("✓ Stall cleared on prospect reply");

  const futureInterview = detectConversationStall({
    messageHints: { lastOutboundAt: staleOutbound, lastInboundAt: null },
    milestone: "INTERVIEW_SCHEDULED",
    prospect: {
      current_step: "CONFIRMED",
      interview_time: new Date(Date.now() + 86400000).toISOString()
    },
    defaultOwnership: OWNERSHIP.WAITING_EVENT,
    agentState: {}
  });
  assert(futureInterview.isStalled === false, "Future confirmed interview should exempt stall");
  console.log("✓ Stall exempt for confirmed future interview");

  const mc = await getMissionControlWithActions("latest");
  assert(mc, "Mission Control should return data");
  const legacy = ["prospect", "brain", "businessRules", "atlasBrief", "agentState", "availableActions"];
  legacy.forEach((key) => assert(key in mc, `Missing legacy field: ${key}`));
  assert(mc.workflow, "Missing workflow object");
  assert(mc.workflow.workflowOwnership !== "SYSTEM_WAITING", "Should not expose legacy ownership value");
  assert(mc.workflow.stall, "Missing workflow.stall object");
  console.log("✓ Mission Control backward compatibility + workflow.stall");

  const { buildPrioritizedWorkflowQueue } = require("../core/missionControlPriorityEngine");
  const { supabase } = require("../services/supabaseService");
  const { data: prospects } = await supabase.from("prospects").select("*").limit(5);
  const queue = await buildPrioritizedWorkflowQueue(prospects || []);
  assert(Array.isArray(queue), "Priority queue should be an array");
  assert(queue.length > 0, "Priority queue should have entries");
  console.log("✓ Backend prioritizedWorkflowQueue engine");

  console.log("\n=== All checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
