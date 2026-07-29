/**
 * Sprint 21.1 — Conversation quality verification.
 * Run: node backend/dev/verifySprint21_1.js
 */

require("dotenv").config();

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
  detectMessageLanguage,
  resolveConversationLanguage
} = require("../core/conversationLanguage");
const {
  buildShortAcknowledgement,
  handleSemanticMessage
} = require("../core/semanticConversationEngine");
const { extractOccupation, extractInformation } = require("../core/informationExtractor");
const { cleanupSimulatorProspect, createSimulatorProspect } = require("./workflowSimulatorService");
const { processSimulatedWhatsAppInbound } = require("./simulatedWhatsAppInboundPipeline");
const { withSimulatorGuard } = require("./simulatorGuard");
const { findProspect } = require("../services/supabaseService");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertReplyLanguage(reply, language) {
  const text = String(reply || "").toLowerCase();

  if (language === "en") {
    assert(
      /\b(thank|thanks|got it|understood|what|do you|authorization|work)\b/i.test(text) &&
        !/\b(gracias por compartirlo|¿en qué|¿tienes)\b/i.test(text),
      `Expected English reply, got: ${reply}`
    );
  } else {
    assert(
      /\b(gracias|entendido|¿|qué|tienes|trabajas)\b/i.test(text),
      `Expected Spanish reply, got: ${reply}`
    );
  }
}

async function main() {
  console.log("=== Sprint 21.1 Verification ===\n");

  assert(detectMessageLanguage("I'm not working right now") === "en", "English phrase detected");
  assert(detectMessageLanguage("Hola, vivo en Miami") === "es", "Spanish phrase detected");
  assert(
    resolveConversationLanguage({ language: "es" }, "Unemployed") === "en",
    "English answer overrides persisted Spanish"
  );
  assert(
    resolveConversationLanguage({ language: "en" }, "Estoy desempleado") === "es",
    "Spanish answer overrides persisted English"
  );
  console.log("✓ Language detection and switching");

  const unemployedAck = buildShortAcknowledgement({ occupation: "unemployed" }, "en");
  assert(!/excellent|great|perfect/i.test(unemployedAck), `"Unemployed" ack is neutral: ${unemployedAck}`);
  assert(
    unemployedAck.includes("Thank you for sharing"),
    `Occupation ack uses neutral wording: ${unemployedAck}`
  );

  const spanishOccAck = buildShortAcknowledgement({ occupation: "enfermera" }, "es");
  assert(
    spanishOccAck.includes("Gracias por compartirlo"),
    `Spanish occupation ack is neutral: ${spanishOccAck}`
  );
  assert(!/excelente|perfecto/i.test(spanishOccAck), "No Excelente/Perfecto for occupation");
  console.log("✓ Context-aware acknowledgments");

  assert(extractOccupation("Unemployed", null, "occupation") === "unemployed", "Unemployed extracted");
  assert(
    extractOccupation("I'm not working right now", null, "occupation") === "unemployed",
    "Not working right now extracted as unemployed"
  );
  assert(extractOccupation("Nurse", null, "occupation") === "Nurse", "Nurse extracted");
  assert(extractOccupation("I work at Amazon", null, "occupation") === "Amazon", "Employer extracted");
  assert(extractOccupation("Student", null, "occupation") === "Student", "Student extracted");
  assert(extractOccupation("Retired", null, "occupation") === "Retired", "Retired extracted");

  const unrelated = extractInformation("What is the pay?", { occupation: null, authorization: null }, {
    nextField: "occupation",
    inSchedule: false
  });
  assert(!unrelated.occupation, "Unrelated question does not advance occupation");
  console.log("✓ Answer interpretation");

  const phone = `sim-ops-${crypto.randomUUID().slice(0, 8)}`;
  await cleanupSimulatorProspect(phone).catch(() => {});

  await createSimulatorProspect({
    phone,
    name: "Sprint 21.1 Lead",
    preset: "NEW_LEAD",
    seedFields: {
      language: "es",
      communication_language: "es"
    }
  });

  await withSimulatorGuard(async () => {
    await processSimulatedWhatsAppInbound({
      phone,
      body: "Hola, quiero información sobre Team Vision."
    });

    const englishLocation = await processSimulatedWhatsAppInbound({
      phone,
      body: "I live in Miami, Florida"
    });

    assertReplyLanguage(englishLocation.reply, "en");
    const acknowledgementLine = String(englishLocation.reply || "").split("\n\n")[0];
    assert(
      !/excelente|perfecto|great|perfect/i.test(acknowledgementLine),
      `No praise in acknowledgement: ${acknowledgementLine}`
    );
    assert(
      /thanks|thank you|gracias/i.test(acknowledgementLine),
      `Neutral location acknowledgement expected: ${acknowledgementLine}`
    );

    const prospectAfter = await findProspect(phone);
    assert(prospectAfter?.city === "Miami", "City saved after English location answer");
    assert(prospectAfter?.state === "FL", "State saved after English location answer");
    assert(
      prospectAfter?.communication_language === "en" || prospectAfter?.language === "en",
      "English message persisted conversation language"
    );
  });

  console.log("✓ Simulator pipeline conversation quality");

  await cleanupSimulatorProspect(phone).catch(() => {});

  const sprint210 = spawnSync("node", ["backend/dev/verifySprint21_0.js"], {
    cwd: `${__dirname}/../..`,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  assert(sprint210.status === 0, "verifySprint21_0 regression failed");
  console.log("✓ Sprint 21.0 simulator regression");

  console.log("\n=== Sprint 21.1 Verification PASSED ===");
}

main().catch((error) => {
  console.error("\n=== Sprint 21.1 Verification FAILED ===");
  console.error(error.message);
  process.exit(1);
});
