/**
 * BR-227 — AI Quality evidence integrity + approval safety.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SIGNAL_TYPES,
  LEARNING_ACTIONS,
  PROPOSAL_STATUSES,
  EVIDENCE_STATUS,
  INSUFFICIENT_EVIDENCE_CODE,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  HIDDEN_REASONING_KEYS,
  MODES,
  isCaptureEligible,
  captureFromSemanticShadow,
  compactInterpretation,
  buildLearningProposal,
  scoreConfidence,
  assessEvidenceCompleteness,
  applyLearningAction,
  containsHiddenReasoning,
  createMemoryStore,
  SYNTHETIC_ORG,
  OTHER_ORG
} = require("../core/aiQuality");
const {
  loadConversationTurns,
  CONVERSATION_TURN_COLUMNS,
  getCaseForScope,
  applyLearningCaseAction
} = require("../services/aiQualityService");

const CAPTURE_ON = {
  ATLAS_AI_QUALITY_CAPTURE_ENABLED: "true",
  ATLAS_AI_QUALITY_MODE: "REVIEW"
};
const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

function participating() {
  return { participationEnabled: true, mode: MODES.REVIEW, sampleRate: 1 };
}

function createFakeSupabase({ prospect = null, prospectError = null, logs = [], logsError = null, calls = [] } = {}) {
  return {
    from(table) {
      const state = { table, filters: {} };
      const builder = {
        select(cols) {
          calls.push({ table, cols, op: "select" });
          return builder;
        },
        eq(col, val) {
          state.filters[col] = val;
          calls.push({ table, col, val, op: "eq" });
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle: async () => {
          if (table === "prospects") {
            if (prospectError) {
              return { data: null, error: prospectError };
            }
            if (
              prospect &&
              state.filters.organization_id &&
              String(prospect.organization_id) !== String(state.filters.organization_id)
            ) {
              return { data: null, error: null };
            }
            return { data: prospect, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve(
            table === "conversation_logs"
              ? { data: logsError ? null : logs, error: logsError || null }
              : { data: null, error: null }
          ).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

function insufficientCase(overrides = {}) {
  return {
    id: "qa-insufficient-handoff",
    organizationId: SYNTHETIC_ORG,
    prospectId: "prospect-empty",
    ownerUserId: null,
    inboundMessageId: null,
    signalType: SIGNAL_TYPES.PREMATURE_HANDOFF,
    legacyInterpretation: null,
    semanticInterpretation: null,
    knownFactsBefore: {},
    knownFactsAfter: {},
    atlasAction: null,
    confidence: null,
    conversationTurns: [],
    ...overrides
  };
}

test("docs: BR-227 documented and APPLY stays off", () => {
  const rules = fs.readFileSync(path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"), "utf8");
  assert.match(rules, /## BR-227 — AI Quality Evidence Integrity/);
  assert.match(rules, /Approve Regression is rejected server-side/);
  assert.match(rules, /semantic APPLY stays OFF/i);
  const service = fs.readFileSync(path.join(__dirname, "../services/aiQualityService.js"), "utf8");
  assert.doesNotMatch(service, /\.eq\("prospect_id"/);
  assert.doesNotMatch(service, /message_type,template_key/);
  assert.match(service, /prospect_phone/);
  assert.match(CONVERSATION_TURN_COLUMNS, /intent/);
  assert.doesNotMatch(CONVERSATION_TURN_COLUMNS, /message_type|template_key|prospect_id/);
});

test("A) PREMATURE_HANDOFF loads bounded turns by org + phone", async () => {
  const calls = [];
  const logs = [
    {
      id: "log-1",
      direction: "incoming",
      created_at: "2026-09-01T20:41:28.000Z",
      intent: "WHATSAPP_INBOUND",
      pipeline: "CONFIRMED",
      current_step: "ASK_LOCATION",
      language: "es"
    },
    {
      id: "log-2",
      direction: "outgoing",
      created_at: "2026-09-01T20:42:00.000Z",
      intent: "CONVERSATION_ENGINE_REPLY",
      pipeline: "CONFIRMED",
      current_step: "HUMAN_REQUIRED",
      language: "es"
    }
  ];
  const supabaseClient = createFakeSupabase({
    prospect: { id: "p1", phone: "+15551212", organization_id: SYNTHETIC_ORG },
    logs,
    calls
  });
  const loaded = await loadConversationTurns(
    "p1",
    SYNTHETIC_ORG,
    { detectedAt: "2026-09-01T20:42:27.000Z" },
    { supabaseClient }
  );
  assert.equal(loaded.error, null);
  assert.equal(loaded.turns.length, 2);
  assert.equal(loaded.turns[0].role, "prospect");
  assert.equal(loaded.turns[1].role, "atlas");
  assert.equal(
    calls.some((item) => item.op === "eq" && item.col === "organization_id" && item.val === SYNTHETIC_ORG),
    true
  );
  assert.equal(
    calls.some((item) => item.op === "eq" && item.col === "prospect_phone" && item.val === "+15551212"),
    true
  );
  assert.equal(JSON.stringify(loaded.turns).includes("message"), false);
});

test("B) reader no longer queries nonexistent conversation_logs columns", () => {
  const source = fs.readFileSync(path.join(__dirname, "../services/aiQualityService.js"), "utf8");
  assert.doesNotMatch(source, /select\("id,direction,created_at,message_type,template_key"\)/);
  assert.match(source, /CONVERSATION_TURN_COLUMNS/);
  assert.equal(CONVERSATION_TURN_COLUMNS.includes("message"), false);
});

test("C) tenant A cannot load tenant B conversation logs", async () => {
  const calls = [];
  const supabaseClient = createFakeSupabase({
    prospect: { id: "p-b", phone: "+15559999", organization_id: OTHER_ORG },
    logs: [{ id: "secret", direction: "incoming", created_at: "2026-09-01T00:00:00.000Z", intent: "WHATSAPP_INBOUND" }],
    calls
  });
  const loaded = await loadConversationTurns("p-b", SYNTHETIC_ORG, {}, { supabaseClient });
  assert.deepEqual(loaded.turns, []);
  assert.equal(
    calls.some((item) => item.table === "conversation_logs" && item.op === "eq" && item.col === "prospect_phone"),
    false
  );
});

test("schema/query failure is observable instead of a silent empty list", async () => {
  const loaded = await loadConversationTurns(
    "p1",
    SYNTHETIC_ORG,
    {},
    {
      supabaseClient: createFakeSupabase({
        prospect: { id: "p1", phone: "+15551212", organization_id: SYNTHETIC_ORG },
        logsError: { message: "column conversation_logs.prospect_id does not exist" }
      })
    }
  );
  assert.deepEqual(loaded.turns, []);
  assert.equal(loaded.error.code, "QUALITY_TURNS_LOOKUP_FAILED");
});

test("D) compact V2 interpretation persists when semantic shadow is skipped", async () => {
  const store = createMemoryStore();
  const result = await captureFromSemanticShadow({
    observation: { eligible: false, reason: "USER_NOT_ALLOWLISTED", legacy: null, semantic: null, confidence: null, latencyMs: 0 },
    organizationId: SYNTHETIC_ORG,
    actingUserId: "owner-1",
    inboundText: "disculpa cual dato",
    interpretation: { intent: "conversation_clarification_request", language: "es", confidence: 0.81 },
    structuredDecision: {
      decision: { nextAction: "human_required" },
      customerReplyPlan: { templateKey: "safe_uncertain_escalate" }
    },
    context: { knownFacts: { city: "Orlando", state: "FL" } },
    tenantSettings: participating(),
    store,
    env: CAPTURE_ON
  });
  assert.equal(result.captured, true);
  const row = [...store.cases.values()][0];
  assert.equal(row.signalType, SIGNAL_TYPES.PREMATURE_HANDOFF);
  assert.equal(row.legacyInterpretation.intent, "conversation_clarification_request");
  assert.equal(row.semanticInterpretation, null);
  assert.equal(row.inboundTextStored, false);
});

test("E) owner_user_id persists when acting owner is known", async () => {
  const store = createMemoryStore();
  await captureFromSemanticShadow({
    observation: { eligible: false, legacy: null, semantic: null, confidence: null },
    organizationId: SYNTHETIC_ORG,
    actingUserId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    inboundText: "which data",
    interpretation: { intent: "conversation_clarification_request" },
    structuredDecision: { customerReplyPlan: { templateKey: "safe_uncertain_escalate" } },
    tenantSettings: participating(),
    store,
    env: CAPTURE_ON
  });
  const row = [...store.cases.values()][0];
  assert.equal(row.ownerUserId, "33ad243a-9d00-4a4d-810b-df2762c0f076");
});

test("F) null confidence does not become numeric 0", () => {
  assert.equal(scoreConfidence({ confidence: null, conversationTurns: [] }), null);
  assert.equal(
    scoreConfidence({
      confidence: null,
      conversationTurns: [{ id: "t1" }],
      knownFactsBefore: { city: "Orlando" }
    }),
    0.72
  );
  assert.equal(
    scoreConfidence({
      confidence: undefined,
      conversationTurns: [{ id: "t1" }],
      atlasAction: "ask_authorization"
    }),
    0.58
  );
  assert.equal(scoreConfidence({ confidence: 0.81 }), 0.81);
  assert.equal(
    scoreConfidence({
      confidence: 0,
      conversationTurns: [{ id: "t1" }],
      legacyInterpretation: { intent: "x" },
      atlasAction: "ask"
    }),
    0
  );
});

test("G) evidence completeness separates PARTIAL / INSUFFICIENT / SUFFICIENT", () => {
  assert.equal(assessEvidenceCompleteness(insufficientCase()).evidenceStatus, EVIDENCE_STATUS.INSUFFICIENT);
  assert.equal(
    assessEvidenceCompleteness({
      conversationTurns: [{ id: "t1" }],
      knownFactsBefore: { city: "Orlando" },
      atlasAction: "escalate_to_human",
      inboundMessageId: "wamid.x",
      confidence: null,
      legacyInterpretation: null,
      semanticInterpretation: null
    }).evidenceStatus,
    EVIDENCE_STATUS.PARTIAL
  );
  assert.equal(
    assessEvidenceCompleteness({
      conversationTurns: [{ id: "t1" }],
      legacyInterpretation: { intent: "conversation_clarification_request" },
      knownFactsBefore: { city: "Orlando" },
      atlasAction: "escalate_to_human",
      inboundMessageId: "wamid.x",
      confidence: 0.8
    }).evidenceStatus,
    EVIDENCE_STATUS.SUFFICIENT
  );
});

test("H) Generate Proposal allowed with insufficient evidence", async () => {
  const store = createMemoryStore();
  await store.insertCase(insufficientCase());
  const result = await applyLearningAction({
    qualityCase: insufficientCase(),
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  assert.equal(result.proposal.status, PROPOSAL_STATUSES.GENERATED);
  assert.equal(result.proposal.proposal.evidence_status, EVIDENCE_STATUS.INSUFFICIENT);
});

test("I+J) Approve Regression rejected and not recommended when insufficient", async () => {
  const store = createMemoryStore();
  const qualityCase = insufficientCase();
  await store.insertCase(qualityCase);
  const generated = await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  assert.notEqual(generated.proposal.recommendedAction, LEARNING_ACTIONS.APPROVE_REGRESSION);
  assert.equal(generated.proposal.proposal.recommended_action, LEARNING_ACTIONS.REQUEST_REVISION);
  await assert.rejects(
    () =>
      applyLearningAction({
        qualityCase: { ...qualityCase, conversationTurns: [] },
        action: LEARNING_ACTIONS.APPROVE_REGRESSION,
        actorUserId: "reviewer-1",
        store
      }),
    (error) => {
      assert.equal(error.publicCode, INSUFFICIENT_EVIDENCE_CODE);
      assert.equal(error.message, INSUFFICIENT_EVIDENCE_MESSAGE);
      return true;
    }
  );
});

test("K) historical case without interpretation remains readable", async () => {
  const store = createMemoryStore();
  store.supabase = createFakeSupabase({ prospect: null });
  await store.insertCase(
    insufficientCase({
      id: "38eebadc-historical",
      inboundMessageId: "wamid.example",
      atlasAction: "escalate_to_human",
      knownFactsBefore: { city: "Orlando", state: "FL" }
    })
  );
  const qualityCase = await getCaseForScope({
    caseId: "38eebadc-historical",
    organizationId: SYNTHETIC_ORG,
    store,
    includeTurns: true
  });
  assert.equal(qualityCase.id, "38eebadc-historical");
  assert.equal(qualityCase.legacyInterpretation, null);
  assert.equal(qualityCase.semanticInterpretation, null);
  assert.ok(Array.isArray(qualityCase.conversationTurns));
  assert.equal(containsHiddenReasoning(qualityCase), false);
});

test("L) successful normal conversation does not create an AI Quality case", async () => {
  const store = createMemoryStore();
  const result = await captureFromSemanticShadow({
    observation: { eligible: false, legacy: null, semantic: null, confidence: null },
    organizationId: SYNTHETIC_ORG,
    inboundText: "Orlando Florida",
    interpretation: { intent: "provide_location" },
    structuredDecision: {
      decision: { nextAction: "ask_authorization" },
      customerReplyPlan: { templateKey: "ask_authorization" }
    },
    context: { knownFacts: {} },
    tenantSettings: participating(),
    store,
    env: CAPTURE_ON
  });
  assert.equal(result.captured, false);
  assert.equal(result.reason, "NO_QUALITY_SIGNAL");
  assert.equal(store.cases.size, 0);
});

test("M) no chain-of-thought stored or returned", () => {
  const compact = compactInterpretation({
    intent: "conversation_clarification_request",
    chainOfThought: "secret",
    hiddenReasoning: "nope",
    thinking: "scratch"
  });
  const json = JSON.stringify(compact);
  for (const key of HIDDEN_REASONING_KEYS) {
    assert.equal(json.includes(`"${key}"`), false, key);
  }
  const proposal = buildLearningProposal(insufficientCase({ chainOfThought: "do not persist" }));
  assert.equal(containsHiddenReasoning(proposal), false);
});

test("N) Team Legacy stays isolated; participation default unchanged", () => {
  const gate = isCaptureEligible({
    organizationId: TEAM_LEGACY_ORG,
    tenantSettings: { participationEnabled: false, mode: MODES.OFF, sampleRate: 1 },
    env: CAPTURE_ON
  });
  assert.equal(gate.eligible, false);
  assert.equal(gate.reason, "TENANT_NOT_PARTICIPATING");
  const source = fs.readFileSync(path.join(__dirname, "../core/aiQuality/captureConfig.js"), "utf8");
  assert.doesNotMatch(source, /af8fb707-f26c-4152-ad77-2d079d30bc8a/);
  assert.doesNotMatch(source, /Team Legacy/);
  const service = fs.readFileSync(path.join(__dirname, "../services/aiQualityService.js"), "utf8");
  assert.doesNotMatch(service, /Team Vision/);
  assert.doesNotMatch(service, /00000000-0000-4000-8000-000000000001/);
});

test("service-layer Approve Regression is blocked without fabricating interpretation", async () => {
  const store = createMemoryStore();
  store.supabase = createFakeSupabase({ prospect: null });
  await store.insertCase(insufficientCase({ id: "qa-service-block" }));
  await applyLearningCaseAction({
    caseId: "qa-service-block",
    organizationId: SYNTHETIC_ORG,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  await assert.rejects(
    () =>
      applyLearningCaseAction({
        caseId: "qa-service-block",
        organizationId: SYNTHETIC_ORG,
        action: LEARNING_ACTIONS.APPROVE_REGRESSION,
        actorUserId: "reviewer-1",
        store
      }),
    (error) => error.publicCode === INSUFFICIENT_EVIDENCE_CODE
  );
});
