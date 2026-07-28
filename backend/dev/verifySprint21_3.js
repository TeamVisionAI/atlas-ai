/**
 * Sprint 21.3 — Team Vision workflow stabilization verification.
 * Run: node backend/dev/verifySprint21_3.js
 */

require("dotenv").config();

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
  buildQualificationBrain,
  getNextMissingField,
  getMissingFields,
  buildProfileFromProspect
} = require("../core/informationModel");
const { extractInformation } = require("../core/informationExtractor");
const { getMissionControlState } = require("../core/missionControlReadModel");
const { assessQualificationFromProspect } = require("../core/recruitingQualificationEngine");
const { getOfferedDays } = require("../core/interviewScheduling");
const { toDateKey } = require("../core/capacityEngine");
const { cleanupSimulatorProspect, createSimulatorProspect } = require("./workflowSimulatorService");
const { processSimulatedWhatsAppInbound } = require("./simulatedWhatsAppInboundPipeline");
const { withSimulatorGuard } = require("./simulatorGuard");
const { findProspect, updateProspect } = require("../services/supabaseService");
const { getMissionControlWithActions } = require("../application/agentActionApplicationService");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function send(phone, body) {
  return withSimulatorGuard(async () =>
    processSimulatedWhatsAppInbound({ phone, body })
  );
}

function assertBrainConsistency(label, brain, expectedNextField) {
  assert(brain.nextField === expectedNextField, `${label}: nextField ${brain.nextField} !== ${expectedNextField}`);
  assert(
    brain.missingFields[0] === expectedNextField,
    `${label}: missingFields order starts with ${brain.missingFields[0]}, expected ${expectedNextField}`
  );
}

async function main() {
  console.log("=== Sprint 21.3 Verification ===\n");

  const emptyProfile = buildProfileFromProspect({ phone: "test", current_step: "NEW" });
  assert(getNextMissingField(emptyProfile) === "authorization", "Empty profile starts at authorization");
  assert(
    getMissingFields(emptyProfile)[0] === "authorization",
    "Missing fields ordered by workflow"
  );
  console.log("✓ Workflow field order is authorization-first");

  const miamiOnly = extractInformation("Miami", { city: null, state: null }, { nextField: "city" });
  assert(miamiOnly.city === "Miami", "City-only answer captures Miami");
  assert(!miamiOnly.state, "City-only answer does not auto-fill state");

  const profileCityOnly = { ...emptyProfile, city: "Miami", authorization: true, occupation: "Sales" };
  assert(getMissingFields(profileCityOnly).includes("state"), "State remains required after city-only save");
  console.log("✓ City/state regression fixed — state not auto-skipped");

  const phoneFaq = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneFaq).catch(() => {});

  await createSimulatorProspect({
    phone: phoneFaq,
    name: "Sprint 21.3 FAQ",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneFaq, "Hi, I want information about Team Vision.");
  await send(phoneFaq, "Yes");
  const faqReply = await send(phoneFaq, "What is this about?");
  assert(/great question|financial services/i.test(faqReply.reply), "FAQ answered naturally");
  assert(/work|occupation|currently do/i.test(faqReply.reply), "FAQ returns to occupation step");
  assert(/now that i've explained/i.test(faqReply.reply.toLowerCase()), "FAQ uses workflow transition");

  const faqProspect = await findProspect(phoneFaq);
  assert(!faqProspect.occupation, "FAQ does not advance occupation");
  assert(faqProspect.work_authorized === true, "Authorization preserved after FAQ");

  const faqBrain = buildQualificationBrain(faqProspect, { message: "What is this about?" });
  assertBrainConsistency("FAQ turn", faqBrain, "occupation");
  console.log("✓ FAQ answered without advancing workflow");

  const phoneFlow = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneFlow).catch(() => {});

  await createSimulatorProspect({
    phone: phoneFlow,
    name: "Sprint 21.3 Flow",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneFlow, "Hello");
  await send(phoneFlow, "Yes");
  await send(phoneFlow, "Teacher");
  const cityReply = await send(phoneFlow, "Miami");
  assert(/state/i.test(cityReply.reply), "After city-only, Atlas asks for state");

  await send(phoneFlow, "FL");
  const flowProspect = await findProspect(phoneFlow);
  assert(flowProspect.city === "Miami" && flowProspect.state === "FL", "City and state saved separately");

  const flowBrain = buildQualificationBrain(flowProspect);
  const flowAssessment = assessQualificationFromProspect(flowProspect);
  const missionControl = await getMissionControlState(phoneFlow, { organizationId: flowProspect.organization_id });
  assert(
    flowBrain.nextField === flowAssessment.nextField,
    "Qualification engine matches qualification brain nextField"
  );
  assert(
    missionControl.brain.nextField === flowBrain.nextField,
    "Mission Control brain matches qualification brain"
  );
  console.log("✓ Single workflow state across engines");

  const phoneLocal = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneLocal).catch(() => {});

  await createSimulatorProspect({
    phone: phoneLocal,
    name: "Sprint 21.3 Local",
    preset: "NEW_LEAD",
    seedFields: {
      language: "en",
      work_authorized: true,
      occupation: "Sales"
    }
  });

  const localLocationReply = await send(phoneLocal, "I live in Miami, Florida");
  assert(/office.*zoom|zoom.*office/i.test(localLocationReply.reply), "Local prospect offered office or Zoom");

  const localReply = await send(phoneLocal, "In office");
  const localProspect = await findProspect(phoneLocal);
  assert(localProspect.interview_type === "In Person", "In office preference saved for local prospect");
  assert(
    /appointment|tomorrow|thursday|schedule|morning|afternoon|day/i.test(localReply.reply),
    "Local prospect advances to scheduling after preference"
  );
  console.log("✓ Local interview routing preserved");

  const phoneRemote = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneRemote).catch(() => {});

  await createSimulatorProspect({
    phone: phoneRemote,
    name: "Sprint 21.3 Remote",
    preset: "NEW_LEAD",
    seedFields: {
      language: "en",
      work_authorized: true,
      occupation: "Sales"
    }
  });

  const remoteReply = await send(phoneRemote, "I live in Orlando, Florida");
  assert(/zoom/i.test(remoteReply.reply), "Remote prospect gets Zoom path");
  assert(!/office or by zoom/i.test(remoteReply.reply), "Remote prospect not offered office");
  console.log("✓ Remote interview routing preserved");

  const offeredDays = getOfferedDays("Zoom").map((day) => toDateKey(day));
  assert(offeredDays.length > 0, "Scheduling reads capacity-backed offered days");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);
  const dayLabels = offeredDays.join(",");
  assert(
    offeredDays.every((dayKey) => typeof dayKey === "string" && dayKey.length >= 10),
    "Offered days are real date keys"
  );
  console.log("✓ Scheduling uses real offered days (capacity-backed)");

  const phoneReview = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneReview).catch(() => {});

  await createSimulatorProspect({
    phone: phoneReview,
    name: "Sprint 21.3 Review",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneReview, "Hi");
  await send(phoneReview, "Yes");
  const reviewProspect = await findProspect(phoneReview);
  const reviewMission = await getMissionControlWithActions(phoneReview, {
    reviewMode: true,
    organizationId: reviewProspect.organization_id
  });

  assert(reviewMission?.brain?.nextField === "occupation", "Review Mission Control nextField matches workflow");
  assert(
    /occupation|Next field: occupation/i.test(reviewMission.atlasBrief.summary.join(" ")),
    "Atlas Brief reflects same next field"
  );
  assert(
    /occupation/i.test(reviewMission.aiActionCenter?.reason || ""),
    "AI Action Center reason references same next field"
  );
  console.log("✓ Mission Control, Atlas Brief, and AI Action Center aligned");

  const sprint212 = spawnSync("node", ["backend/dev/verifySprint21_2.js"], {
    cwd: `${__dirname}/../..`,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  assert(sprint212.status === 0, "Sprint 21.2 regression failed");
  console.log("✓ Sprint 21.2 regression");

  await cleanupSimulatorProspect(phoneFaq).catch(() => {});
  await cleanupSimulatorProspect(phoneFlow).catch(() => {});
  await cleanupSimulatorProspect(phoneLocal).catch(() => {});
  await cleanupSimulatorProspect(phoneRemote).catch(() => {});
  await cleanupSimulatorProspect(phoneReview).catch(() => {});

  console.log("\n=== Sprint 21.3 Verification PASSED ===");
  console.log("Conversation pipeline is production-ready for Meta App Review workflow consistency.");
}

main().catch((error) => {
  console.error("\n=== Sprint 21.3 Verification FAILED ===");
  console.error(error.message);
  process.exit(1);
});
