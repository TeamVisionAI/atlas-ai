/**
 * Conversations Center recruiting inbox eligibility gate + TEST restore path.
 * BR-142 auto-reply unchanged; tenant scoping unchanged.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";

const AGENT_FILE = path.join(__dirname, "../data/agentActionState.json");

async function withTempWorkflow(run) {
  const previousWorkflowEnv = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "atlas-cc-inbox-"));
  const tempWorkflow = path.join(tempDir, "workflowState.json");
  fs.writeFileSync(tempWorkflow, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempWorkflow;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";

  const prevAgent = fs.existsSync(AGENT_FILE)
    ? fs.readFileSync(AGENT_FILE, "utf8")
    : null;
  fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
  fs.writeFileSync(AGENT_FILE, "{}");

  try {
    return await run(tempWorkflow);
  } finally {
    if (previousWorkflowEnv === undefined) delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    else process.env.ATLAS_WORKFLOW_STATE_FILE = previousWorkflowEnv;
    if (previousBackend === undefined) delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    else process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    if (prevAgent == null) {
      try {
        fs.unlinkSync(AGENT_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(AGENT_FILE, prevAgent);
    }
  }
}

function prospect(overrides = {}) {
  return {
    id: overrides.id || "p-test",
    organization_id: TEAM_VISION,
    owner_user_id: NIOVEL,
    phone: overrides.phone || "+17865551001",
    name: overrides.name || "Prospect",
    source: overrides.source ?? "UNKNOWN",
    entry_method: overrides.entry_method ?? "UNATTRIBUTED",
    current_step: overrides.current_step || "NEW",
    updated_at: "2026-08-19T12:00:00.000Z",
    created_at: "2026-08-19T12:00:00.000Z",
    ...overrides
  };
}

async function loadModel(filter, prospects, workflowByPhone = {}) {
  const {
    buildConversationsCenterReadModel
  } = require("../core/conversationsCenter/conversationsCenterReadModel");
  const { savePersistedWorkflowState } = require("../core/workflowStateStore");

  for (const [phone, patch] of Object.entries(workflowByPhone)) {
    const row = prospects.find((p) => p.phone === phone);
    await savePersistedWorkflowState(phone, patch, {
      organizationId: row?.organization_id || TEAM_VISION,
      prospectId: row?.id || null
    });
  }

  return buildConversationsCenterReadModel({
    organizationId: TEAM_VISION,
    filter,
    prospects
  });
}

function phonesIn(model) {
  return model.items.map((item) => item.phone);
}

test("evaluateRecruitingInboxEligibility: historical PERSONAL_WHATSAPP source is not inbox eligible", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(
    prospect({
      source: "UNKNOWN",
      entry_method: "UNATTRIBUTED"
    }),
    { atlasEligibilitySource: "PERSONAL_WHATSAPP" }
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PERSONAL_WHATSAPP_NOT_ELIGIBLE");
});

test("evaluateRecruitingInboxEligibility: personal-channel CTWA remains eligible", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(
    prospect({
      source: "PERSONAL_WHATSAPP",
      entry_method: "PERSONAL_WHATSAPP"
    }),
    { atlasEligibilitySource: "CTWA_REFERRAL" }
  );
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "VERIFIED_ELIGIBILITY_SOURCE");
});

test("evaluateRecruitingInboxEligibility: UNKNOWN + UNATTRIBUTED => not eligible", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(
    prospect({ phone: "+17869325073", name: "Davicito" }),
    {}
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "NOT_RECRUITING_ORIGIN");
});

test("evaluateRecruitingInboxEligibility: durable atlasEligibilitySource QR => eligible", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(
    prospect({
      phone: "+17868381963",
      name: "Jesus Macadan",
      source: "FACEBOOK",
      entry_method: "CLICK_TO_WHATSAPP"
    }),
    { atlasEligibilitySource: "QR" }
  );
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "VERIFIED_ELIGIBILITY_SOURCE");
});

test("evaluateRecruitingInboxEligibility: stored entry_method QR => eligible", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(
    prospect({ entry_method: "QR", source: "car_magnet" }),
    {}
  );
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "QR_ATTRIBUTION");
});

test("evaluateRecruitingInboxEligibility: stored entry_method CLICK_TO_WHATSAPP => eligible", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(
    prospect({
      phone: "+13053479639",
      name: "Rosi",
      source: "FACEBOOK",
      entry_method: "CLICK_TO_WHATSAPP"
    }),
    {}
  );
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "VERIFIED_STORED_ORIGIN");
});

test("evaluateRecruitingInboxEligibility: CTWA durable source => eligible", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(prospect(), {
    atlasEligibilitySource: "CTWA_REFERRAL"
  });
  assert.equal(result.eligible, true);
});

test("UNKNOWN + UNATTRIBUTED excluded from Active tab", async () => {
  await withTempWorkflow(async () => {
    const rows = [
      prospect({ phone: "+17869325073", name: "Davicito" }),
      prospect({ phone: "+17864880287", name: "Primerica", owner_user_id: NIOVEL })
    ];
    const model = await loadModel("active", rows);
    assert.equal(phonesIn(model).includes("+17869325073"), false);
    assert.equal(phonesIn(model).includes("+17864880287"), false);
  });
});

test("UNKNOWN excluded from Atlas tab even with ATLAS ownership", async () => {
  await withTempWorkflow(async () => {
    const phone = "+17869325073";
    const rows = [prospect({ phone, name: "Davicito" })];
    const model = await loadModel("atlas", rows, {
      [phone]: { workflowOwnership: "ATLAS", needsHumanAttention: false }
    });
    assert.equal(phonesIn(model).includes(phone), false);
  });
});

test("UNKNOWN + HUMAN ownership excluded from Human tab", async () => {
  await withTempWorkflow(async () => {
    const phone = "+17864880287";
    const rows = [prospect({ phone, name: "Primerica" })];
    const model = await loadModel("human", rows, {
      [phone]: {
        workflowOwnership: "AGENT",
        manualAgentOwnership: true,
        humanTakenOverAt: "2026-08-19T20:00:00.000Z"
      }
    });
    assert.equal(phonesIn(model).includes(phone), false);
  });
});

test("UNKNOWN + needsHumanAttention excluded from Needs Attention tab", async () => {
  await withTempWorkflow(async () => {
    const phone = "+17864880287";
    const rows = [prospect({ phone, name: "Primerica" })];
    const model = await loadModel("needs_attention", rows, {
      [phone]: { needsHumanAttention: true, workflowOwnership: "AGENT" }
    });
    assert.equal(phonesIn(model).includes(phone), false);
  });
});

test("eligible QR prospect marked TEST hidden from Active (injected prospects)", async () => {
  await withTempWorkflow(async () => {
    const phone = "+17868381963";
    const rows = [
      prospect({
        phone,
        name: "Jesus Macadan",
        source: "FACEBOOK",
        entry_method: "CLICK_TO_WHATSAPP"
      })
    ];
    const model = await loadModel("active", rows, {
      [phone]: {
        atlasEligibilitySource: "QR",
        inboxMarkedTestAt: "2026-08-18T02:11:17.530Z"
      }
    });
    assert.equal(phonesIn(model).includes(phone), false);
  });
});

test("restoreConversation clears inboxMarkedTestAt", async () => {
  await withTempWorkflow(async () => {
    const phone = "+17868381963";
    const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { restoreConversation } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

    await savePersistedWorkflowState(
      phone,
      {
        atlasEligibilitySource: "QR",
        inboxMarkedTestAt: "2026-08-18T02:11:17.530Z"
      },
      { organizationId: TEAM_VISION, prospectId: "jesus-id" }
    );

    await restoreConversation(phone, {
      organizationId: TEAM_VISION,
      prospectId: "jesus-id"
    });

    const after = await loadPersistedWorkflowState(phone, {
      organizationId: TEAM_VISION,
      prospectId: "jesus-id"
    });
    assert.equal(after.inboxMarkedTestAt, null);
    assert.equal(after.atlasEligibilitySource, "QR");
  });
});

test("restored eligible QR prospect visible in Active", async () => {
  await withTempWorkflow(async () => {
    const phone = "+17868381963";
    const rows = [
      prospect({
        id: "jesus-id",
        phone,
        name: "Jesus Macadan",
        source: "FACEBOOK",
        entry_method: "CLICK_TO_WHATSAPP",
        workflow_state: { atlasEligibilitySource: "QR", inboxMarkedTestAt: null }
      })
    ];
    const model = await loadModel("active", rows, {
      [phone]: { atlasEligibilitySource: "QR", inboxMarkedTestAt: null }
    });
    assert.equal(phonesIn(model).includes(phone), true);
    assert.equal(model.items.find((i) => i.phone === phone)?.source, "FACEBOOK");
  });
});

test("restore non-eligible prospect does not make it visible", async () => {
  await withTempWorkflow(async () => {
    const phone = "+17869325073";
    const rows = [prospect({ phone, name: "Davicito" })];
    const { restoreConversation } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");

    await savePersistedWorkflowState(
      phone,
      { inboxMarkedTestAt: "2026-08-18T00:00:00.000Z" },
      { organizationId: TEAM_VISION, prospectId: "dav-id" }
    );
    await restoreConversation(phone, {
      organizationId: TEAM_VISION,
      prospectId: "dav-id"
    });

    const model = await loadModel("active", rows, {
      [phone]: { inboxMarkedTestAt: null }
    });
    assert.equal(phonesIn(model).includes(phone), false);
  });
});

test("BR-080 evaluateEscalation skips non-recruiting prospect", () => {
  const { evaluateEscalation } = require("../core/newLeadAttentionEngine");
  const row = prospect({
    phone: "+17869325073",
    new_lead_received_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    attention_status: "new",
    assignment_status: "unassigned"
  });
  const decision = evaluateEscalation(row, Date.now());
  assert.equal(decision.shouldEscalate, false);
});

test("BR-080 evaluateEscalation still escalates recruiting prospect", () => {
  const { evaluateEscalation, ESCALATION_UNACKNOWLEDGED_MS } = require("../core/newLeadAttentionEngine");
  const row = prospect({
    phone: "+17868381963",
    source: "car_magnet",
    entry_method: "QR",
    new_lead_received_at: new Date(Date.now() - ESCALATION_UNACKNOWLEDGED_MS - 1000).toISOString(),
    attention_status: "new",
    assignment_status: "assigned",
    owner_user_id: NIOVEL,
    workflow_state: { atlasEligibilitySource: "QR" }
  });
  const decision = evaluateEscalation(row, Date.now());
  assert.equal(decision.shouldEscalate, true);
});

test("markHumanAttentionRequired no-ops for non-recruiting prospect", async () => {
  await withTempWorkflow(async () => {
    const { markHumanAttentionRequired } = require("../core/newLeadAttentionEngine");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const phone = "+17864880287";
    const row = prospect({ phone, name: "Primerica" });

    const result = await markHumanAttentionRequired(row, "ai_or_delivery_failure");
    assert.equal(result, null);

    const wf = await loadPersistedWorkflowState(phone, {
      organizationId: TEAM_VISION,
      prospectId: row.id
    });
    assert.equal(wf.needsHumanAttention, false);
  });
});

test("inbox gate applies before ownership filters in read model source", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../core/conversationsCenter/conversationsCenterReadModel.js"),
    "utf8"
  );
  assert.match(source, /resolveRecruitingInboxEligibility/);
  assert.match(source, /evaluateRecruitingInboxEligibility/);
});

test("BR-142 evaluateAtlasInboundAutomationEligibility unchanged for NOT_ELIGIBLE unknown", () => {
  const {
    evaluateAtlasInboundAutomationEligibility
  } = require("../core/atlasInboundAutomationEligibility");
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: prospect({ phone: "+17869325073" }),
    workflowState: {}
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "NOT_ELIGIBLE");
});
