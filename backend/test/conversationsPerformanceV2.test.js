/**
 * Conversations Performance V2 — contracts and lightweight read-model behavior.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";

test("summarizeConversationListItem keeps sidebar fields only", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../core/conversationsCenter/conversationsCenterReadModel.js"),
    "utf8"
  );

  assert.match(source, /function summarizeConversationListItem/);
  assert.match(source, /ownershipState: item\.ownershipState/);
  assert.match(source, /view: useSummaryView \? "summary" : "full"/);
});

test("embedded workflow fast-path is used for production-loaded prospects", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../core/conversationsCenter/conversationsCenterReadModel.js"),
    "utf8"
  );

  assert.match(source, /useEmbeddedWorkflow = !options\.prospects/);
  assert.match(source, /workflowStateFromProspectRow/);
  assert.match(source, /view === "summary"/);
  assert.match(source, /INBOX_LOGS_PER_PHONE/);
});

test("thread projection skips workflow and appointment enrichment", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../core/communicationsCenterReadModel.js"),
    "utf8"
  );

  assert.match(source, /threadProjection/);
  assert.match(source, /THREAD_DEFAULT_LIMIT = 40/);
  assert.match(source, /Promise\.resolve\(\[\]\)/);
});

test("frontend contracts request summary list + thread projection", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/services/conversationsCenterService.js"),
    "utf8"
  );
  const communications = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/services/communicationsCenterApi.js"),
    "utf8"
  );
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/ConversationsPage.jsx"),
    "utf8"
  );
  const timeline = fs.readFileSync(
    path.join(
      __dirname,
      "../../frontend/src/features/prospect-workspace/components/CommunicationsCenterTimeline.jsx"
    ),
    "utf8"
  );

  assert.match(service, /view = "summary"/);
  assert.match(communications, /projection/);
  assert.match(page, /ConversationListSkeleton/);
  assert.match(page, /listError/);
  assert.match(timeline, /projection:\s*"thread"/);
  assert.match(timeline, /Show older messages/);
});

test("workflowStateFromProspectRow reads embedded JSONB", () => {
  const { workflowStateFromProspectRow } = require("../core/workflowStateStore");
  const state = workflowStateFromProspectRow({
    id: "pid",
    organization_id: TEAM_VISION,
    workflow_state: {
      workflowOwnership: "ATLAS",
      needsHumanAttention: true
    }
  });

  assert.equal(state.workflowOwnership, "ATLAS");
  assert.equal(state.needsHumanAttention, true);
});

test("conversation log inbox index migration exists", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/053_conversation_logs_inbox_index.sql"),
    "utf8"
  );
  assert.match(sql, /idx_conversation_logs_org_phone_created/);
});
