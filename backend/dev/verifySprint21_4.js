/**
 * Sprint 21.4 — Team Vision canonical recruiting workflow verification.
 * Run: node backend/dev/verifySprint21_4.js
 */

require("dotenv").config();

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
  buildQualificationBrain,
  getNextMissingField,
  getMissingFields,
  buildProfileFromProspect,
  FIELD_ORDER
} = require("../core/informationModel");
const {
  defaultCaptureState,
  encodeQualificationCapture
} = require("../core/qualificationCaptureState");
const { extractInformation } = require("../core/informationExtractor");
const { getMissionControlState } = require("../core/missionControlReadModel");
const { cleanupSimulatorProspect, createSimulatorProspect } = require("./workflowSimulatorService");
const { processSimulatedWhatsAppInbound } = require("./simulatedWhatsAppInboundPipeline");
const { withSimulatorGuard } = require("./simulatorGuard");
const { buildOfferedTimes } = require("../core/interviewScheduling");
const { toDateKey } = require("../core/capacityEngine");
const { findProspect } = require("../services/supabaseService");

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

async function main() {
  console.log("=== Sprint 21.4 Verification ===\n");

  assert(
    FIELD_ORDER.join(",") === "city,state,authorization,interviewType,dayPart,schedule,name,email",
    "Canonical field order includes post-schedule name and optional email"
  );
  console.log("✓ Canonical workflow field order");

  const miamiOnly = extractInformation("Miami", { city: null, state: null }, { nextField: "city" });
  assert(miamiOnly.city === "Miami" && !miamiOnly.state, "City-only does not auto-confirm Florida (BR-082)");
  assert(miamiOnly.proposedState === "FL", "City-only may propose Florida for confirmation");

  const emptyProfile = buildProfileFromProspect({ phone: "test", current_step: "NEW" });
  assert(getNextMissingField(emptyProfile) === "city", "Empty profile starts at city");
  assert(!getMissingFields(emptyProfile).includes("occupation"), "Occupation is not required");
  console.log("✓ Occupation never blocks scheduling (H)");

  const singleLoc = extractInformation(
    "I live in Miami, Florida",
    { city: null, state: null, authorization: null },
    { nextField: "city" }
  );
  assert(singleLoc.city === "Miami" && singleLoc.state === "FL", "Single message captures city and state (F)");
  console.log("✓ Single-message location capture (F)");

  const phoneLocal = `sim-214-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneLocal).catch(() => {});

  await createSimulatorProspect({
    phone: phoneLocal,
    name: "Sprint 21.4 Local",
    preset: "NEW_LEAD",
    seedFields: { language: "es", communication_language: "es" }
  });

  const firstLocal = await send(phoneLocal, "Hola");
  assert(/ciudad y estado/i.test(firstLocal.reply), `First message asks city/state (A): ${firstLocal.reply}`);

  const cityLocal = await send(phoneLocal, "Miami, Florida");
  assert(/permiso de trabajo|autorización|authorization/i.test(cityLocal.reply), "After location asks authorization (A)");

  const authLocal = await send(phoneLocal, "Sí");
  assert(/oficina|office|2500 NW 79th/i.test(authLocal.reply), "Local prospect offered office (A)");
  assert(/mañana|tarde|morning|afternoon/i.test(authLocal.reply), "Local prospect asked dayPart (A)");

  const dayPartLocal = await send(phoneLocal, "Tarde");
  assert(
    /disponible|available|citas|appointments|pm|a las/i.test(dayPartLocal.reply),
    `After dayPart offers calendar times (A): ${dayPartLocal.reply}`
  );
  console.log("✓ A. Local office flow");

  const phoneRemote = `sim-214-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneRemote).catch(() => {});

  await createSimulatorProspect({
    phone: phoneRemote,
    name: "Sprint 21.4 Remote",
    preset: "NEW_LEAD",
    seedFields: { language: "en", communication_language: "en" }
  });

  await send(phoneRemote, "Hello");
  await send(phoneRemote, "Orlando, Florida");
  const authRemote = await send(phoneRemote, "Yes");
  assert(/zoom/i.test(authRemote.reply), "Remote prospect routed to Zoom (B)");
  assert(/morning|afternoon/i.test(authRemote.reply), "Remote prospect asked dayPart (B)");

  await send(phoneRemote, "Afternoon");
  const afternoonProspect = await findProspect(phoneRemote);
  const schedulingMatch = String(afternoonProspect.notes || "").match(/SCHEDULING:({[\s\S]*?})(?:\||$)/);
  let offeredTimeLabel = "12:15 PM";

  if (schedulingMatch) {
    try {
      const schedulingState = JSON.parse(schedulingMatch[1]);
      const slot = schedulingState?.offeredTimes?.[0];

      if (slot?.timeKey) {
        const [hourText, minuteText] = slot.timeKey.split(":");
        const hourNum = Number(hourText);
        const meridiem = hourNum >= 12 ? "PM" : "AM";
        const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
        offeredTimeLabel =
          Number(minuteText) > 0 ? `${displayHour}:${minuteText} ${meridiem}` : `${displayHour} ${meridiem}`;
      }
    } catch (_error) {
      // keep default offeredTimeLabel
    }
  }

  const timesReply = await send(phoneRemote, offeredTimeLabel);
  assert(
    /does that work|work for you|funciona|availability|confirm/i.test(timesReply.reply),
    `Time selection asks confirmation: ${timesReply.reply}`
  );
  const remoteConfirm = await send(phoneRemote, "Yes, that works");
  assert(/full name|nombre completo/i.test(remoteConfirm.reply), `After slot asks full name: ${remoteConfirm.reply}`);

  const emailPrompt = await send(phoneRemote, "Jane Remote");
  assert(/email|correo/i.test(emailPrompt.reply), `After name asks email: ${emailPrompt.reply}`);

  const finalReply = await send(phoneRemote, "no");
  const remoteProspect = await findProspect(phoneRemote);
  assert(
    /30 minutes|all set|programado|confirm|look forward|quedaste programado/i.test(finalReply.reply) ||
      remoteProspect.calendar_event_id ||
      remoteProspect.current_step === "CONFIRMED",
    `Remote Zoom booking completes without email (B): ${finalReply.reply}`
  );
  console.log("✓ B. Remote Zoom flow");

  const phoneSwitch = `sim-214-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneSwitch).catch(() => {});

  await createSimulatorProspect({
    phone: phoneSwitch,
    name: "Sprint 21.4 Zoom Switch",
    preset: "NEW_LEAD",
    seedFields: { language: "es", communication_language: "es" }
  });

  await send(phoneSwitch, "Hola");
  await send(phoneSwitch, "Miami, Florida");
  await send(phoneSwitch, "Sí");
  const switchReply = await send(phoneSwitch, "No puedo ir a la oficina, prefiero Zoom");
  assert(/perfecto|zoom/i.test(switchReply.reply), "Local prospect switched to Zoom without resistance (C)");
  assert(/mañana|tarde/i.test(switchReply.reply), "Resumes at dayPart after Zoom switch (C)");
  console.log("✓ C. Local prospect requests Zoom");

  const phoneFaq = `sim-214-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneFaq).catch(() => {});

  await createSimulatorProspect({
    phone: phoneFaq,
    name: "Sprint 21.4 FAQ",
    preset: "NEW_LEAD",
    seedFields: { language: "es", communication_language: "es" }
  });

  await send(phoneFaq, "Hola");
  await send(phoneFaq, "Miami, Florida");
  const faqReply = await send(phoneFaq, "¿De qué se trata?");
  assert(/servicios financieros|financial/i.test(faqReply.reply), "FAQ answered briefly (D)");
  assert(/permiso de trabajo|autorización/i.test(faqReply.reply), "FAQ resumes authorization question (D)");

  const faqProspect = await findProspect(phoneFaq);
  const faqBrain = buildQualificationBrain(faqProspect);
  assert(faqBrain.nextField === "authorization", "FAQ does not advance workflow (D)");
  console.log("✓ D. FAQ interruption");

  const phoneSeeded = `sim-214-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneSeeded).catch(() => {});

  await createSimulatorProspect({
    phone: phoneSeeded,
    name: "Sprint 21.4 Seeded",
    preset: "QUALIFICATION",
    seedFields: { language: "en", work_authorized: true, occupation: "Sales" }
  });

  const seededProspect = await findProspect(phoneSeeded);
  const seededBrain = buildQualificationBrain(seededProspect);
  assert(seededBrain.nextField === "city", "Seeded city/state cannot bypass capture (E)");
  assert(!seededBrain.canBeginScheduling, "Seeded location does not enable scheduling (E)");
  console.log("✓ E. Seeded simulator protection");

  const captured = encodeQualificationCapture({
    ...defaultCaptureState(),
    city: true,
    state: true
  });
  const afterLocation = buildProfileFromProspect({
    phone: "x",
    city: "Miami",
    state: "FL",
    notes: captured
  });
  assert(
    getNextMissingField(afterLocation, {
      notes: captured,
      captureState: { ...defaultCaptureState(), city: true, state: true }
    }) === "authorization",
    "After explicit location capture nextField is authorization (F)"
  );
  console.log("✓ F. Single-message location advances to authorization");

  const phoneMc = `sim-214-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phoneMc).catch(() => {});

  await createSimulatorProspect({
    phone: phoneMc,
    name: "Sprint 21.4 MC",
    preset: "NEW_LEAD",
    seedFields: { language: "en" }
  });

  await send(phoneMc, "Hi");
  await send(phoneMc, "Miami, Florida");
  const mc = await getMissionControlState(phoneMc);
  assert(mc?.brain?.captureState, "Mission Control exposes captureState");
  assert(mc?.brain?.nextField === "authorization", "Mission Control nextField matches workflow");
  assert(typeof mc?.brain?.isLocal === "boolean", "Mission Control exposes local/remote decision");
  console.log("✓ Mission Control synchronization");

  const sprint213 = spawnSync("node", ["backend/dev/verifySprint21_3.js"], {
    cwd: `${__dirname}/../..`,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  assert(sprint213.status === 0, "Sprint 21.3 regression failed");

  const sprint212 = spawnSync("node", ["backend/dev/verifySprint21_2.js"], {
    cwd: `${__dirname}/../..`,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  assert(sprint212.status === 0, "Sprint 21.2 regression failed");

  await cleanupSimulatorProspect(phoneLocal).catch(() => {});
  await cleanupSimulatorProspect(phoneRemote).catch(() => {});
  await cleanupSimulatorProspect(phoneSwitch).catch(() => {});
  await cleanupSimulatorProspect(phoneFaq).catch(() => {});
  await cleanupSimulatorProspect(phoneSeeded).catch(() => {});
  await cleanupSimulatorProspect(phoneMc).catch(() => {});

  console.log("\n=== Sprint 21.4 Verification PASSED ===");
  console.log("Team Vision canonical workflow is aligned for recording-ready live simulation.");
}

main().catch((error) => {
  console.error("\n=== Sprint 21.4 Verification FAILED ===");
  console.error(error.message);
  process.exit(1);
});
