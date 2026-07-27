/**
 * Sprint 11.5 — Autonomous workflow validation.
 * Run: node backend/dev/verifySprint11_5.js
 */

require("dotenv").config();

const { runCompleteValidation } = require("./autonomousValidationEngine");

function printReport(report) {
  console.log("\n=== Atlas Validation Report (Sprint 11.5) ===\n");
  console.log(`Ran at: ${report.ranAt}`);
  console.log(`Duration: ${report.durationSeconds}s`);
  console.log(`Steps passed: ${report.stepsPassed}`);
  console.log(`Steps failed: ${report.stepsFailed}`);
  console.log(`Overall: ${report.overall} (${report.passRate}%)\n`);

  for (const line of report.displayLines) {
    console.log(line);
  }

  console.log(`\nOverall: ${report.passRate === 100 ? "100% PASS" : "FAILED"}\n`);

  if (report.remainingIssues.length) {
    console.log("--- Remaining Issues ---");
    for (const issue of report.remainingIssues) {
      console.log(`[${issue.section}] ${issue.step}`);
      console.log(`  Reason: ${issue.reason}`);
      if (issue.location) {
        console.log(`  Location: ${issue.location}`);
      }
      if (issue.suggestedFix) {
        console.log(`  Suggested fix: ${issue.suggestedFix}`);
      }
    }
    console.log("");
  }

  if (report.regressionRisks.length) {
    console.log("--- Regression Risks ---");
    for (const risk of report.regressionRisks) {
      console.log(`- ${risk}`);
    }
    console.log("");
  }

  if (report.recommendations.length) {
    console.log("--- Recommendations ---");
    for (const rec of report.recommendations) {
      console.log(`- ${rec}`);
    }
    console.log("");
  }
}

async function main() {
  console.log("Sprint 11.5 — Running complete validation + guardrails...\n");

  const report = await runCompleteValidation();
  printReport(report);

  if (report.overall !== "PASS") {
    process.exit(1);
  }

  console.log("=== Sprint 11.5 validation complete ===");
}

main().catch((error) => {
  console.error("\nSprint 11.5 validation crashed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
