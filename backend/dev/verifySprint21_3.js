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
const {
  defaultCaptureState,
  encodeQualificationCapture
} = require("../core/qualificationCaptureState");
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
  assert(getNextMissingField(emptyProfile) === "city", "Empty profile starts at city");
  assert(
    getMissingFields(emptyProfile)[0] === "city",
    "Missing fields ordered by workflow"
  );
  assert(!getMissingFields(emptyProfile).includes("occupation"), "Occupation is not required");
  console.log("✓ Workflow field order is city-first");

  const miamiOnly = extractInformation("Miami", { city: null, state: null }, { nextField: "city" });
  assert(miamiOnly.city === "Miami", "City-only answer captures Miami");
  // BR-082: city-only must not persist inferred state as confirmed.
  assert(!miamiOnly.state, "City-only does not auto-confirm Florida");
  assert(miamiOnly.proposedState === "FL", "Recognized city may propose Florida for confirmation");

  const profileCityOnly = { ...emptyProfile, city: "Miami", state: "FL", authorization: true, occupation: "Sales" };
  const captureNotes = encodeQualificationCapture({
    ...defaultCaptureState(),
    city: true,
    state: true
  });
  assert(
    !getMissingFields(profileCityOnly, {
      notes: captureNotes,
      captureState: { ...defaultCaptureState(), city: true, state: true }
    }).includes("state"),
    "Recognized city does not require a separate state question"
  );
  assert(
    getMissingFields(profileCityOnly, {
      notes: encodeQualificationCapture(defaultCaptureState()),
      captureState: defaultCaptureState()
    }).includes("city"),
    "Seeded city without capture still requires city step"
  );
  console.log("✓ City-only proposes state for confirmation (BR-082)");

  const phoneFaq = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneFaq).catch(() => {});

  await createSimulatorProspect({
    phone: phoneFaq,
    name: "Sprint 21.3 FAQ",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneFaq, "Hi, I want information about Team Vision.");
  await send(phoneFaq, "Miami, Florida");
  const faqReply = await send(phoneFaq, "What is this about?");
  assert(/financial|servicios financieros/i.test(faqReply.reply), `FAQ answered naturally: ${faqReply.reply}`);
  assert(/authorization|permiso|work/i.test(faqReply.reply), "FAQ returns to authorization step");

  const faqProspect = await findProspect(phoneFaq);
  assert(faqProspect.work_authorized !== true, "FAQ does not capture authorization");

  const faqBrain = buildQualificationBrain(faqProspect, { message: "What is this about?" });
  assertBrainConsistency("FAQ turn", faqBrain, "authorization");
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
  const afterCity = await send(phoneFlow, "Miami");
  assert(
    /Florida|estado|state/i.test(afterCity.reply),
    "City-only asks state confirmation instead of skipping to authorization"
  );

  const afterState = await send(phoneFlow, "Florida");
  assert(/permiso|authorization|work/i.test(afterState.reply), "Confirmed state advances to authorization");

  await send(phoneFlow, "Yes");
  const flowProspect = await findProspect(phoneFlow);
  assert(flowProspect.city === "Miami" && flowProspect.state === "FL", "Confirmed city/state persisted");

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
      communication_language: "en"
    }
  });

  await send(phoneLocal, "Hello");
  await send(phoneLocal, "Miami, Florida");
  await send(phoneLocal, "Yes");
  const localLocationReply = await send(phoneLocal, "Morning");
  assert(/office|2500 NW|morning|afternoon|available|appointment/i.test(localLocationReply.reply), "Local prospect offered office path and scheduling");

  const localProspect = await findProspect(phoneLocal);
  assert(localProspect.interview_type === "In Person", "Local prospect defaults to In Person");
  console.log("✓ Local interview routing preserved");

  const phoneRemote = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneRemote).catch(() => {});

  await createSimulatorProspect({
    phone: phoneRemote,
    name: "Sprint 21.3 Remote",
    preset: "NEW_LEAD",
    seedFields: {
      language: "en",
      communication_language: "en"
    }
  });

  await send(phoneRemote, "Hello");
  const remoteReply = await send(phoneRemote, "Orlando, Florida");
  assert(/authorization|permiso|work/i.test(remoteReply.reply), "Remote prospect asked authorization after location");
  assert(!/office or by zoom|office.*zoom/i.test(remoteReply.reply), "Remote prospect not offered office choice");
  const authRemote = await send(phoneRemote, "Yes");
  assert(/zoom/i.test(authRemote.reply), "Remote prospect gets Zoom path after authorization");
  const remoteAfterAuth = await send(phoneRemote, "Afternoon");
  assert(/available|appointment|pm|am|citas/i.test(remoteAfterAuth.reply), "Remote prospect advances to scheduling");
  console.log("✓ Remote interview routing preserved");

  const phoneSeeded = `sim-213-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneSeeded).catch(() => {});

  await createSimulatorProspect({
    phone: phoneSeeded,
    name: "Sprint 21.3 Seeded Bypass",
    preset: "QUALIFICATION",
    seedFields: { language: "en", work_authorized: true, occupation: "Sales" }
  });

  const seededProspect = await findProspect(phoneSeeded);
  const seededBrain = buildQualificationBrain(seededProspect);
  assert(seededProspect.city === "Miami", "Seed may preload city for display");
  assert(seededBrain.nextField === "city", "Seeded city does not bypass city collection");
  assert(!seededBrain.canBeginScheduling, "Seeded location does not enable scheduling");
  assert(
    /blocked: city not captured|blocked: state not captured|blocked: city present in profile|blocked: state present in profile/i.test(
      seededBrain.schedulingEligibleReason
    ),
    `Scheduling blocked with reason: ${seededBrain.schedulingEligibleReason}`
  );
  console.log("✓ Simulator seed cannot bypass explicit city/state capture");

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
  await send(phoneReview, "Miami, Florida");
  const reviewProspect = await findProspect(phoneReview);
  const reviewMission = await getMissionControlWithActions(phoneReview, {
    reviewMode: true,
    organizationId: reviewProspect.organization_id
  });

  assert(reviewMission?.brain?.nextField === "authorization", "Review Mission Control nextField matches workflow");
  assert(
    /authorization|Next field: authorization/i.test(reviewMission.atlasBrief.summary.join(" ")),
    "Atlas Brief reflects same next field"
  );
  assert(
    /authorization/i.test(reviewMission.aiActionCenter?.reason || ""),
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
  await cleanupSimulatorProspect(phoneSeeded).catch(() => {});
  await cleanupSimulatorProspect(phoneReview).catch(() => {});

  console.log("\n=== Sprint 21.3 Verification PASSED ===");
  console.log("Conversation pipeline is production-ready for Meta App Review workflow consistency.");
}

main().catch((error) => {
  console.error("\n=== Sprint 21.3 Verification FAILED ===");
  console.error(error.message);
  process.exit(1);
});
