/**
 * Sprint 21.2 — WhatsApp simulator conversation bug fixes verification.
 * Run: node backend/dev/verifySprint21_2.js
 */

require("dotenv").config();

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
  detectMessageLanguage,
  resolveConversationLanguage
} = require("../core/conversationLanguage");
const { extractInformation, extractLocation } = require("../core/informationExtractor");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const { isLocalTeamVisionCity } = require("../core/localAreaConfig");
const { mergeNotesWithSchedulingState, PHASES } = require("../core/schedulingState");
const { cleanupSimulatorProspect, createSimulatorProspect } = require("./workflowSimulatorService");
const { processSimulatedWhatsAppInbound } = require("./simulatedWhatsAppInboundPipeline");
const { withSimulatorGuard } = require("./simulatorGuard");
const { findProspect, updateProspect } = require("../services/supabaseService");
const { toDateKey } = require("../core/capacityEngine");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEnglish(text, label = "reply") {
  const lower = String(text || "").toLowerCase();
  assert(
    /\b(thank|thanks|what|do you|authorization|work|city|state|office|zoom|availability|does that work)\b/i.test(
      lower
    ) && !/\b(¿en qué|gracias por compartirlo|¿tienes|¿cuál prefieres)\b/i.test(lower),
    `Expected English ${label}, got: ${text}`
  );
}

function assertSpanish(text, label = "reply") {
  const lower = String(text || "").toLowerCase();
  assert(
    /\b(gracias|¿|qué|tienes|ciudad|estado|oficina|zoom|disponibilidad|te funciona)\b/i.test(lower),
    `Expected Spanish ${label}, got: ${text}`
  );
}

async function send(phone, body) {
  return withSimulatorGuard(async () =>
    processSimulatedWhatsAppInbound({ phone, body })
  );
}

async function seedScheduleTimePhase(phone, { interviewType = "Zoom", period = "morning" } = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateKey = toDateKey(tomorrow);

  const schedulingState = {
    phase: PHASES.TIME,
    offeredDays: [dateKey],
    selectedDay: dateKey,
    period,
    offeredTimes: [],
    selectedTime: null,
    pendingConfirmation: null,
    isWorking: false,
    overrideRequest: null
  };

  await updateProspect(phone, {
    work_authorized: true,
    occupation: "Sales",
    city: "Miami",
    state: "FL",
    interview_type: interviewType,
    current_step: "SCHEDULE",
    appointment_type: PHASES.TIME,
    notes: mergeNotesWithSchedulingState(null, schedulingState)
  });
}

async function main() {
  console.log("=== Sprint 21.2 Verification ===\n");

  // Unit: language persistence
  assert(
    resolveConversationLanguage({ language: "es" }, "Yes, I am authorized") === "en",
    "English answer switches active language to en"
  );
  assert(
    resolveConversationLanguage({ language: "en" }, "Sí, tengo autorización") === "es",
    "Spanish answer switches active language to es"
  );
  console.log("✓ Shared active language resolution");

  // Unit: location extraction guards
  const greetingLoc = extractLocation("Hola, quiero información sobre Team Vision.", {
    nextField: "city"
  });
  assert(!greetingLoc.city && !greetingLoc.state, "Greeting does not populate city/state");

  const miamiLoc = extractLocation("Vivo en Miami, FL", { nextField: "city" });
  assert(miamiLoc.city === "Miami" && miamiLoc.state === "FL", "Miami FL parsed from vivo en");

  const orlandoLoc = extractLocation("I live in Orlando, Florida", { nextField: "city" });
  assert(orlandoLoc.city === "Orlando" && orlandoLoc.state === "FL", "Orlando Florida parsed");

  const unrelatedLoc = extractInformation("Hola, quiero información sobre Team Vision", {}, {
    nextField: "city"
  });
  assert(!unrelatedLoc.city, "Initial inquiry does not extract city");
  console.log("✓ City/state extraction guards");

  // Unit: local routing
  assert(isLocalTeamVisionCity("Miami"), "Miami is local");
  assert(isLocalTeamVisionCity("Fort Lauderdale"), "Fort Lauderdale is local");
  assert(!isLocalTeamVisionCity("Orlando"), "Orlando is outside local area");
  assert(evaluateCoverage({ city: "Orlando", state: "FL" }).coverage === "OUTSIDE", "Orlando outside");
  console.log("✓ Local interview routing config");

  // Unit: interview preference scoping
  const zoomWhenNotActive = extractInformation("Zoom please", { interviewType: null }, {
    nextField: "occupation"
  });
  assert(!zoomWhenNotActive.interviewType, "Zoom not inferred when occupation is active field");

  const officeWhenActive = extractInformation("In office", { interviewType: null }, {
    nextField: "interviewType"
  });
  assert(officeWhenActive.interviewType === "In Person", "In office saved when interviewType active");
  console.log("✓ Interview preference extraction scoping");

  const phoneA = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneA).catch(() => {});

  await createSimulatorProspect({
    phone: phoneA,
    name: "Sprint 21.2 Lang A",
    preset: "NEW_LEAD",
    seedFields: { language: "es", communication_language: "es" }
  });

  await send(phoneA, "Hola, quiero información sobre Team Vision.");
  const englishAuth = await send(phoneA, "Yes, I have work authorization");
  assertEnglish(englishAuth.reply, "authorization reply + next question");
  const prospectA = await findProspect(phoneA);
  assert(
    prospectA.communication_language === "en" || prospectA.language === "en",
    "English persisted after switch"
  );
  console.log("✓ A. Spanish question → English answer stays English");

  const phoneB = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneB).catch(() => {});

  await createSimulatorProspect({
    phone: phoneB,
    name: "Sprint 21.2 Lang B",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneB, "Hi, I want information about Team Vision.");
  const spanishAuth = await send(phoneB, "Sí, tengo autorización para trabajar");
  assertSpanish(spanishAuth.reply, "authorization reply + next question");
  const prospectB = await findProspect(phoneB);
  assert(
    prospectB.communication_language === "es" || prospectB.language === "es",
    "Spanish persisted after switch"
  );
  console.log("✓ B. English question → Spanish answer stays Spanish");

  const phoneC = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneC).catch(() => {});

  await createSimulatorProspect({
    phone: phoneC,
    name: "Sprint 21.2 Clean Start",
    preset: "NEW_LEAD"
  });

  await send(phoneC, "Hola, quiero información sobre Team Vision");
  const prospectC = await findProspect(phoneC);
  assert(!prospectC.city, "Initial message must not populate city");
  assert(!prospectC.state, "Initial message must not populate state");
  console.log("✓ C. Initial inquiry does not populate city/state");

  const phoneFlow = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneFlow).catch(() => {});

  await createSimulatorProspect({
    phone: phoneFlow,
    name: "Sprint 21.2 Flow",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneFlow, "Hi, I want information about Team Vision.");
  await send(phoneFlow, "Yes");
  const occReply = await send(phoneFlow, "I work at Amazon");
  assertEnglish(occReply.reply);
  assert(/city and state/i.test(occReply.reply), "After occupation asks for city/state");

  let flowProspect = await findProspect(phoneFlow);
  assert(flowProspect.occupation, "Occupation saved");
  assert(!/amazon/i.test(`${flowProspect.city || ""} ${flowProspect.state || ""}`), "Occupation not stored as location");
  console.log("✓ D. Occupation answer saves and asks city/state");

  const localReply = await send(phoneFlow, "Vivo en Miami, FL");
  assertSpanish(localReply.reply);
  flowProspect = await findProspect(phoneFlow);
  assert(flowProspect.city === "Miami", `City saved as Miami, got ${flowProspect.city}`);
  assert(flowProspect.state === "FL", `State saved as FL, got ${flowProspect.state}`);
  assert(
    /oficina.*zoom|zoom.*oficina|office.*zoom|zoom.*office/i.test(localReply.reply),
    `Local area offers office or Zoom: ${localReply.reply}`
  );
  console.log("✓ E. Miami location saves and offers office or Zoom");

  const phoneOrlando = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneOrlando).catch(() => {});

  await createSimulatorProspect({
    phone: phoneOrlando,
    name: "Sprint 21.2 Orlando",
    preset: "NEW_LEAD",
    seedFields: {
      language: "en",
      communication_language: "en",
      work_authorized: true,
      occupation: "Teacher"
    }
  });

  const orlandoReply = await send(phoneOrlando, "I live in Orlando, Florida");
  assertEnglish(orlandoReply.reply);
  assert(
    /zoom/i.test(orlandoReply.reply) && !/office or by zoom|oficina o por zoom/i.test(orlandoReply.reply),
    `Outside area explains Zoom only: ${orlandoReply.reply}`
  );
  const orlandoProspect = await findProspect(phoneOrlando);
  assert(orlandoProspect.city === "Orlando", "Orlando city saved");
  console.log("✓ F. Orlando location offers Zoom only");

  const prefReply = await send(phoneFlow, "In office");
  flowProspect = await findProspect(phoneFlow);
  assert(flowProspect.interview_type === "In Person", "In office preference saved");
  assert(
    /morning|afternoon|day|schedule|tomorrow|monday|tuesday|wednesday|thursday|friday|mañana|jueves|lunes|martes|miércoles|miercoles|viernes|citas disponibles|available/i.test(
      prefReply.reply
    ),
    "After preference advances to scheduling"
  );
  console.log("✓ G. In office preference saves and advances to scheduling");

  const phoneSchedule = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneSchedule).catch(() => {});

  await createSimulatorProspect({
    phone: phoneSchedule,
    name: "Sprint 21.2 Schedule",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await seedScheduleTimePhase(phoneSchedule);
  const timeReply = await send(phoneSchedule, "I prefer 9 am, is it possible?");
  const scheduleProspect = await findProspect(phoneSchedule);
  assert(
    scheduleProspect.current_step !== "CONFIRMED",
    "Time request must not immediately confirm interview"
  );
  assert(!scheduleProspect.calendar_event_id, "No calendar event before explicit confirmation");
  assert(
    /does that work|availability|9/i.test(timeReply.reply),
    `Asks for confirmation when available: ${timeReply.reply}`
  );
  console.log("✓ H. Time request parses 9 AM and asks confirmation");

  const confirmReply = await send(phoneSchedule, "Yes, that works");
  const confirmedProspect = await findProspect(phoneSchedule);
  assert(
    confirmedProspect.current_step === "CONFIRMED" || confirmedProspect.appointment_date,
    "Explicit confirmation schedules interview"
  );
  assert(/confirm/i.test(confirmReply.reply), `Confirmation reply expected: ${confirmReply.reply}`);
  console.log("✓ I. Explicit confirmation schedules when awaiting confirmation");

  const phoneUnrelated = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneUnrelated).catch(() => {});

  await createSimulatorProspect({
    phone: phoneUnrelated,
    name: "Sprint 21.2 Unrelated Yes",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneUnrelated, "Hi, I want information about Team Vision.");
  await send(phoneUnrelated, "Yes");
  const occupationYes = await send(phoneUnrelated, "Yes");
  const unrelatedProspect = await findProspect(phoneUnrelated);
  assert(
    unrelatedProspect.work_authorized === true,
    "Authorization yes accepted when authorization is active"
  );
  assert(!unrelatedProspect.occupation, "Unrelated yes does not fill occupation");
  assert(
    /work|trabaj/i.test(occupationYes.reply),
    "Still asks for occupation after unrelated yes"
  );
  assert(
    !unrelatedProspect.interview_type && !unrelatedProspect.appointment_date,
    "Unrelated yes does not set interview preference or schedule"
  );
  console.log("✓ J. Unrelated yes does not skip workflow fields");

  const sprint210 = spawnSync("node", ["backend/dev/verifySprint21_0.js"], {
    cwd: `${__dirname}/../..`,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  assert(sprint210.status === 0, "verifySprint21_0 regression failed");

  const sprint211 = spawnSync("node", ["backend/dev/verifySprint21_1.js"], {
    cwd: `${__dirname}/../..`,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  assert(sprint211.status === 0, "verifySprint21_1 regression failed");
  console.log("✓ K. Sprint 21.0 and 21.1 regression");

  await cleanupSimulatorProspect(phoneA).catch(() => {});
  await cleanupSimulatorProspect(phoneB).catch(() => {});
  await cleanupSimulatorProspect(phoneC).catch(() => {});
  await cleanupSimulatorProspect(phoneFlow).catch(() => {});
  await cleanupSimulatorProspect(phoneOrlando).catch(() => {});
  await cleanupSimulatorProspect(phoneSchedule).catch(() => {});
  await cleanupSimulatorProspect(phoneUnrelated).catch(() => {});

  console.log("\n=== Sprint 21.2 Verification PASSED ===");
}

main().catch((error) => {
  console.error("\n=== Sprint 21.2 Verification FAILED ===");
  console.error(error.message);
  process.exit(1);
});
