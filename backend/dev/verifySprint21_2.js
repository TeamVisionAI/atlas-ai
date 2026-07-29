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
const {
  defaultCaptureState,
  encodeQualificationCapture
} = require("../core/qualificationCaptureState");
const { cleanupSimulatorProspect, createSimulatorProspect } = require("./workflowSimulatorService");
const { processSimulatedWhatsAppInbound } = require("./simulatedWhatsAppInboundPipeline");
const { withSimulatorGuard } = require("./simulatorGuard");
const { findProspect, updateProspect } = require("../services/supabaseService");
const { toDateKey } = require("../core/capacityEngine");
const { buildOfferedTimes } = require("../core/interviewScheduling");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEnglish(text, label = "reply") {
  const lower = String(text || "").toLowerCase();
  assert(
    /\b(thank|thanks|got it|what|do you|authorization|work|city|state|office|zoom|availability|does that work|excellent|morning|afternoon|prefer)\b/i.test(
      lower
    ) && !/\b(¿en qué|gracias por compartirlo|¿tienes|¿cuál prefieres|excelente\. estamos)\b/i.test(lower),
    `Expected English ${label}, got: ${text}`
  );
}

function assertSpanish(text, label = "reply") {
  const lower = String(text || "").toLowerCase();
  assert(
    /\b(gracias|got it|¿|qué|tienes|ciudad|estado|oficina|zoom|disponibilidad|te funciona|excelente|mañana|tarde|prefieres)\b/i.test(lower),
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

  const capturedQualification = {
    ...defaultCaptureState(),
    city: true,
    state: true,
    authorization: true,
    interviewType: true,
    dayPart: true
  };

  await updateProspect(phone, {
    work_authorized: true,
    occupation: "Sales",
    city: "Miami",
    state: "FL",
    interview_type: interviewType,
    current_step: "SCHEDULE",
    appointment_type: PHASES.TIME,
    notes: mergeNotesWithSchedulingState(
      encodeQualificationCapture(capturedQualification),
      schedulingState
    )
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
    nextField: "city"
  });
  assert(!zoomWhenNotActive.interviewType, "Zoom not inferred when city is active field");

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
  await send(phoneA, "Miami, Florida");
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
  await send(phoneB, "Miami, Florida");
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
  await send(phoneFlow, "Miami");
  const stateReply = await send(phoneFlow, "FL");
  assert(/authorization|permiso|work/i.test(stateReply.reply), "After city/state asks authorization");

  await send(phoneFlow, "Yes");
  const localReply = await send(phoneFlow, "Morning");
  assertEnglish(localReply.reply);
  let flowProspect = await findProspect(phoneFlow);
  assert(flowProspect.city === "Miami", `City saved as Miami, got ${flowProspect.city}`);
  assert(flowProspect.state === "FL", `State saved as FL, got ${flowProspect.state}`);
  assert(
    /office|2500 NW|morning|afternoon|available|appointment/i.test(localReply.reply),
    `Local area offers office path and scheduling: ${localReply.reply}`
  );
  console.log("✓ D/E. Miami location saves and advances toward scheduling");

  const phoneOrlando = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneOrlando).catch(() => {});

  await createSimulatorProspect({
    phone: phoneOrlando,
    name: "Sprint 21.2 Orlando",
    preset: "NEW_LEAD",
    seedFields: {
      language: "en",
      communication_language: "en"
    }
  });

  await send(phoneOrlando, "Hello");
  const orlandoReply = await send(phoneOrlando, "Orlando, Florida");
  assert(/authorization|permiso|work/i.test(orlandoReply.reply), "Orlando location asks authorization first");
  const orlandoAuth = await send(phoneOrlando, "Yes");
  assertEnglish(orlandoAuth.reply);
  assert(
    /zoom/i.test(orlandoAuth.reply) && !/office or by zoom|oficina o por zoom/i.test(orlandoAuth.reply),
    `Outside area explains Zoom only: ${orlandoAuth.reply}`
  );
  const orlandoAfterAuth = await send(phoneOrlando, "Afternoon");
  assert(
    /available|appointment|pm|am|citas/i.test(orlandoAfterAuth.reply),
    `Outside area advances to scheduling: ${orlandoAfterAuth.reply}`
  );
  const orlandoProspect = await findProspect(phoneOrlando);
  assert(orlandoProspect.city === "Orlando", "Orlando city saved");
  console.log("✓ F. Orlando location offers Zoom only");

  flowProspect = await findProspect(phoneFlow);
  assert(flowProspect.interview_type === "In Person", "Local Miami defaults to In Person");
  console.log("✓ G. Local preference advances toward scheduling");

  const phoneSchedule = `sim-212-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneSchedule).catch(() => {});

  await createSimulatorProspect({
    phone: phoneSchedule,
    name: "Sprint 21.2 Schedule",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await seedScheduleTimePhase(phoneSchedule);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateKey = toDateKey(tomorrow);
  const openSlots = buildOfferedTimes(dateKey, "Zoom", "morning");
  assert(openSlots.length > 0, "Need an open morning slot for schedule verification");
  const [hourText, minuteText] = openSlots[0].timeKey.split(":");
  const hourNum = Number(hourText);
  const meridiem = hourNum >= 12 ? "pm" : "am";
  const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
  const requestedTime =
    Number(minuteText) > 0
      ? `${displayHour}:${minuteText} ${meridiem}`
      : `${displayHour} ${meridiem}`;

  const timeReply = await send(
    phoneSchedule,
    `I prefer ${requestedTime}, is it possible?`
  );
  const scheduleProspect = await findProspect(phoneSchedule);
  assert(
    scheduleProspect.current_step !== "CONFIRMED",
    "Time request must not immediately confirm interview"
  );
  assert(!scheduleProspect.calendar_event_id, "No calendar event before explicit confirmation");
  assert(
    /does that work|availability|work for you|funciona/i.test(timeReply.reply),
    `Asks for confirmation when available: ${timeReply.reply}`
  );
  console.log("✓ H. Time request parses time and asks confirmation");

  const confirmReply = await send(phoneSchedule, "Yes, that works");
  assert(
    /full name|nombre completo/i.test(confirmReply.reply),
    `After slot confirmation asks full name: ${confirmReply.reply}`
  );

  const emailPrompt = await send(phoneSchedule, "Test Schedule User");
  assert(
    /email|correo/i.test(emailPrompt.reply),
    `After name asks email: ${emailPrompt.reply}`
  );

  const finalReply = await send(phoneSchedule, "test.schedule@example.com");
  const confirmedProspect = await findProspect(phoneSchedule);
  assert(
    confirmedProspect.current_step === "CONFIRMED" || confirmedProspect.calendar_event_id,
    "Full happy path schedules interview after name and email"
  );
  assert(
    /confirm|all set|quedaste programado|programado|look forward/i.test(finalReply.reply),
    `Confirmation reply expected: ${finalReply.reply}`
  );
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
  await send(phoneUnrelated, "Miami, Florida");
  const authYes = await send(phoneUnrelated, "Yes");
  const unrelatedYes = await send(phoneUnrelated, "Yes");
  const unrelatedProspect = await findProspect(phoneUnrelated);
  assert(
    unrelatedProspect.work_authorized === true,
    "Authorization yes accepted when authorization is active"
  );
  assert(
    /morning|afternoon|mañana|tarde/i.test(unrelatedYes.reply),
    "After authorization advances to dayPart, not unrelated yes capture"
  );
  assert(
    !unrelatedProspect.appointment_date,
    "Unrelated yes does not schedule interview"
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
