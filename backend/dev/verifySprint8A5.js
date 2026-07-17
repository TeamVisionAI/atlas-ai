/**
 * Sprint 8A.5 — Workflow stabilization verification.
 * Run: node backend/dev/verifySprint8A5.js
 */

require("dotenv").config();

const { parseInterviewDatetime } = require("../core/parseInterviewDatetime");
const {
  isSimulatorProspect,
  filterProductionProspects
} = require("../core/productionProspectFilter");
const {
  mapToCanonicalMilestone,
  isInterviewPast
} = require("../core/milestoneMapper");
const { MILESTONES } = require("../core/workflowConstants");
const { supabase } = require("../services/supabaseService");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { runAllGoldenScenarios } = require("./goldenScenarios");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=== Sprint 8A.5 Verification ===\n");

  assert(isSimulatorProspect("sim-golden-01-abc"), "sim- prefix detected");
  assert(!isSimulatorProspect("17862347083"), "real phone not simulator");
  console.log("✓ Simulator prospect detection");

  const mixed = [
    { phone: "sim-test" },
    { phone: "17862347083" },
    { phone: "developer-test-user" }
  ];
  assert(
    filterProductionProspects(mixed).length === 2,
    "filterProductionProspects should remove sim-*"
  );
  console.log("✓ Production prospect filter");

  const parsedFromAppointment = parseInterviewDatetime({
    interview_time: "Mañana a las 9:30 AM",
    appointment_date: "2026-07-17T13:30:00+00:00"
  });
  assert(
    parsedFromAppointment === Date.parse("2026-07-17T13:30:00+00:00"),
    "Should fall back to appointment_date when interview_time is not parseable"
  );

  const parsedFromIso = parseInterviewDatetime({
    interview_time: "2026-07-20T21:27:16.878Z",
    appointment_date: "2026-07-20T00:00:00+00:00"
  });
  assert(
    parsedFromIso === Date.parse("2026-07-20T21:27:16.878Z"),
    "Should prefer parseable interview_time"
  );

  const unparsed = parseInterviewDatetime({
    interview_time: "5:00 PM",
    appointment_date: null
  });
  assert(unparsed === null, "Unparseable values should return null");
  console.log("✓ Interview datetime parsing fallback");

  const pastConfirmed = mapToCanonicalMilestone({
    prospect: {
      current_step: "CONFIRMED",
      interview_time: "Mañana a las 9:30 AM",
      appointment_date: "2026-07-17T13:30:00+00:00"
    },
    currentStep: "CONFIRMED",
    missingFields: [],
    agentState: {},
    messageHints: {}
  });
  assert(
    pastConfirmed === MILESTONES.INTERVIEW_RESULT_PENDING,
    "Past confirmed interview without outcome should be INTERVIEW_RESULT_PENDING"
  );
  console.log("✓ Milestone uses appointment_date fallback");

  const { data: allProspects } = await supabase.from("prospects").select("phone");
  const productionPhones = filterProductionProspects(allProspects || []).map(
    (row) => row.phone
  );
  assert(
    productionPhones.every((phone) => !isSimulatorProspect(phone)),
    "Production filter should exclude all sim-* rows"
  );
  console.log("✓ Supabase production filter sanity check");

  const simMc = await getMissionControlWithActions("sim-golden-01-3f84ce60");
  assert(simMc === null, "Production Mission Control must not serve sim-* phones");
  console.log("✓ Mission Control blocks sim-* prospects");

  const realMc = await getMissionControlWithActions("17862347083");
  assert(realMc?.prospect?.phone === "17862347083", "Real prospect still reachable");
  assert(realMc.workflow?.canonicalMilestone, "Real prospect workflow present");
  console.log("✓ Production prospect Mission Control intact");

  const devUserPast = isInterviewPast({
    interview_time: "Mañana a las 9:30 AM",
    appointment_date: "2026-07-17T13:30:00+00:00"
  });
  assert(devUserPast === true, "developer-test-user interview should read as past");
  console.log("✓ Real prospect datetime classification");

  console.log("\n--- Prior sprint regressions ---");
  const { execSync } = require("child_process");
  execSync("node backend/dev/verifySprint8A2.js", { stdio: "inherit", cwd: process.cwd() });
  execSync("node backend/dev/verifySprint8A3.js", { stdio: "inherit", cwd: process.cwd() });

  console.log("\n--- Golden Scenarios ---");
  const golden = await runAllGoldenScenarios();
  console.log(`Golden: ${golden.passed}/${golden.total} passed`);

  golden.reports.forEach((report) => {
    const icon = report.pass ? "✓" : "✗";
    console.log(`  ${icon} ${report.scenarioName}`);
    if (!report.pass) {
      console.log("    expected:", report.expectedResult);
      console.log("    actual:", report.actualResult);
    }
  });

  assert(golden.failed === 0, `${golden.failed} golden scenario(s) failed`);

  console.log("\n=== All Sprint 8A.5 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
