/**
 * Sprint 17.0 — Platform status service verification.
 * Run: node backend/dev/verifyPlatformStatus.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const REPO_ROOT = path.resolve(__dirname, "../..");
const {
  buildPlatformStatusPayload,
  getPlatformStatus,
  parseFrontmatter,
  parseEnvironmentStatusTable
} = require("../services/platformStatusService");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyFrontmatterParser() {
  const sample = `---
sprint: 17
title: Atlas Self-Awareness
phase: Production Recruiting Automation
status: active
---

# Sprint 17
`;

  const parsed = parseFrontmatter(sample);
  assert(parsed.frontmatter.sprint === "17", "Frontmatter sprint must parse");
  assert(parsed.frontmatter.title === "Atlas Self-Awareness", "Frontmatter title must parse");
  assert(parsed.frontmatter.phase === "Production Recruiting Automation", "Frontmatter phase must parse");
}

function verifyEnvironmentTableParser() {
  const markdown = `
## Environment Status

| Component | Status |
| Database | 🟢 Connected |
| Atlas Core | 🟢 Certified |
`;

  const rows = parseEnvironmentStatusTable(markdown);
  assert(rows.length === 2, "Environment table must parse two rows");
  assert(rows[0].component === "Database", "First environment row must be Database");
}

function verifyPlatformStatusPayload() {
  const payload = buildPlatformStatusPayload();

  assert(payload.data, "Payload must include data");
  assert(payload.data.platform, "Payload must include platform block");
  assert(payload.data.sprint, "Payload must include sprint block");
  assert(payload.data.git, "Payload must include git block");
  assert(payload.data.documentation, "Payload must include documentation block");
  assert(payload.data.external, "Payload must include external block");
  assert(Array.isArray(payload.warnings), "Payload must include warnings array");

  assert(payload.data.platform.version === "1.0.0", "Version must come from package.json");
  assert(payload.data.sprint.number === 17, "Sprint number must come from CURRENT_SPRINT.md");
  assert(payload.data.sprint.title === "Atlas Self-Awareness", "Sprint title must come from CURRENT_SPRINT.md");
  assert(
    payload.data.external.metaTechProviderStatus === "in_review",
    "Meta review status must come from externalReviewStatus.json"
  );

  const serialized = JSON.stringify(payload);
  assert(!serialized.includes(REPO_ROOT), "Payload must not expose absolute filesystem paths");
  assert(!serialized.includes(".env"), "Payload must not expose env files");
}

function verifyMissingSprintDocument() {
  const sprintPath = path.join(REPO_ROOT, "docs/00-executive/CURRENT_SPRINT.md");
  const backupPath = `${sprintPath}.verify-backup`;

  assert(fs.existsSync(sprintPath), "CURRENT_SPRINT.md must exist for baseline test");

  fs.renameSync(sprintPath, backupPath);

  try {
    const payload = buildPlatformStatusPayload();
    assert(payload.data.sprint.number === null, "Missing sprint document must return null sprint number");
    assert(
      payload.warnings.some((warning) => warning.includes("CURRENT_SPRINT.md")),
      "Missing sprint document must add warning"
    );
  } finally {
    fs.renameSync(backupPath, sprintPath);
  }
}

function verifyMissingGitRepository() {
  const gitPath = path.join(REPO_ROOT, ".git");
  const backupPath = path.join(os.tmpdir(), `atlas-git-backup-${Date.now()}`);

  if (!fs.existsSync(gitPath)) {
    const payload = buildPlatformStatusPayload();
    assert(payload.data.git.branch === null, "Missing git must return null branch");
    assert(
      payload.warnings.some((warning) => warning.toLowerCase().includes("git")),
      "Missing git must add warning"
    );
    return;
  }

  fs.renameSync(gitPath, backupPath);

  try {
    const payload = buildPlatformStatusPayload();
    assert(payload.data.git.branch === null, "Missing git must return null branch");
    assert(
      payload.warnings.some((warning) => warning.toLowerCase().includes("git")),
      "Missing git must add warning"
    );
  } finally {
    fs.renameSync(backupPath, gitPath);
  }
}

function verifyCaching() {
  const first = getPlatformStatus({ forceRefresh: true });
  const second = getPlatformStatus();

  assert(first.ok === true, "First platform status response must be ok");
  assert(second.cached === true, "Second platform status response should be cached");
}

function main() {
  verifyFrontmatterParser();
  verifyEnvironmentTableParser();
  verifyPlatformStatusPayload();
  verifyMissingSprintDocument();
  verifyMissingGitRepository();
  verifyCaching();
  console.log("verifyPlatformStatus: all checks passed");
}

main();
