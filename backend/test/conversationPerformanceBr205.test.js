/**
 * BR-205 — Conversation Performance eligibility + exclusive status counts.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const {
  buildConversationPerformanceCounts,
  evaluateConversationPerformanceEligibility
} = require("../core/conversationPerformanceEngine");
const { buildConversationOwnership } = require("../core/executiveDashboardV2Metrics");
const { CONVERSATION_OWNERSHIP_STATE } = require("../core/conversationsCenter/constants");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");

const ORG = "00000000-0000-4000-8000-000000000001";

function prospect(overrides = {}) {
  return {
    id: overrides.id || `p-${overrides.phone || "+17865550101"}`,
    organization_id: ORG,
    owner_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    phone: overrides.phone || "+17865550101",
    name: overrides.name || "Lead",
    source: overrides.source ?? null,
    entry_method: overrides.entry_method ?? null,
    current_step: overrides.current_step || "NEW",
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    workflow_state: overrides.workflow_state || {},
    ...overrides
  };
}

function ctwaLead(overrides = {}) {
  return prospect({
    phone: "+17865551001",
    ctwa_clid: "clid-ctwa-1",
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" },
    ...overrides
  });
}

function qrLead(overrides = {}) {
  return prospect({
    id: "p-qr",
    phone: "+17865551002",
    source: WHATSAPP_SOURCE.CAR_MAGNET,
    entry_method: WHATSAPP_ENTRY_METHOD.QR,
    workflow_state: { atlasEligibilitySource: "QR" },
    ...overrides
  });
}

test("docs: BR-205 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-205/);
  assert.match(rules, /Conversation Performance/);
});

test("A) META_AD_DESTINATION-only contact is excluded", () => {
  const row = prospect({
    phone: "+17865551901",
    entry_method: WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION,
    workflow_state: { atlasEligibilitySource: "META_AD_DESTINATION" }
  });
  const eligibility = evaluateConversationPerformanceEligibility(row);
  assert.equal(eligibility.eligible, false);
  const counts = buildConversationPerformanceCounts([row]);
  assert.equal(counts.total, 0);
  assert.equal(counts.excluded, 1);
  assert.ok(counts.exclusions.LEGACY_AMBIGUOUS >= 1);
});

test("B) contact-only unsupported inbound is excluded", () => {
  const missing = evaluateConversationPerformanceEligibility(null);
  assert.equal(missing.eligible, false);
  assert.equal(missing.reason, "MISSING_PROSPECT");

  const contactOnly = evaluateConversationPerformanceEligibility({
    workflow_state: { lastInboundType: "unsupported", metaErrorCode: 131060 }
  });
  assert.equal(contactOnly.eligible, false);
  assert.equal(contactOnly.reason, "CONTACT_ONLY");

  const counts = buildConversationPerformanceCounts([
    { workflow_state: { lastInboundType: "unsupported" } }
  ]);
  assert.equal(counts.total, 0);
});

test("B2) personal WhatsApp inbound is excluded", () => {
  const row = prospect({
    phone: "+17865551910",
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entry_method: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    workflow_state: { atlasEligibilitySource: "PERSONAL_WHATSAPP", workflowOwnership: "AGENT" }
  });
  const eligibility = evaluateConversationPerformanceEligibility(row);
  assert.equal(eligibility.eligible, false);
  const counts = buildConversationPerformanceCounts([row]);
  assert.equal(counts.total, 0);
  assert.equal(counts.excluded, 1);
});

test("C) valid CTWA lead is counted", () => {
  const counts = buildConversationPerformanceCounts([ctwaLead()]);
  assert.equal(counts.total, 1);
  assert.equal(counts.atlas, 1);
});

test("D) valid QR/campaign lead is counted", () => {
  const campaign = prospect({
    id: "p-campaign",
    phone: "+17865551003",
    source: WHATSAPP_SOURCE.CAMPAIGN_INTAKE,
    entry_method: WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE,
    workflow_state: { atlasEligibilitySource: "CAMPAIGN_INTAKE_CODE" }
  });
  const counts = buildConversationPerformanceCounts([qrLead(), campaign]);
  assert.equal(counts.total, 2);
});

test("E) Human eligible prospect counted once", () => {
  const row = ctwaLead({
    workflow_state: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      needsHumanAttention: true,
      manualAgentOwnership: true,
      humanTakenOverAt: "2026-09-01T14:00:00.000Z",
      workflowOwnership: "AGENT"
    }
  });
  const counts = buildConversationPerformanceCounts([row, row]);
  assert.equal(counts.human, 1);
  assert.equal(counts.needsAttention, 0);
  assert.equal(counts.total, 1);
});

test("F) Atlas eligible prospect counted once", () => {
  const row = ctwaLead({
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL", workflowOwnership: "ATLAS" }
  });
  const counts = buildConversationPerformanceCounts([row]);
  assert.equal(counts.atlas, 1);
  assert.equal(counts.human, 0);
  assert.equal(counts.needsAttention, 0);
});

test("G) Needs Attention eligible prospect counted once", () => {
  const row = ctwaLead({
    phone: "+17865551007",
    workflow_state: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      needsHumanAttention: true,
      workflowOwnership: "AGENT"
    }
  });
  const counts = buildConversationPerformanceCounts([row]);
  assert.equal(counts.needsAttention, 1);
  assert.equal(counts.human, 0);
  assert.equal(counts.atlas, 0);
});

test("H/I) total equals exclusive Atlas + Human + Needs Attention", () => {
  const rows = [
    ctwaLead({
      id: "p-atlas",
      phone: "+17865551101",
      workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
    }),
    ctwaLead({
      id: "p-human",
      phone: "+17865551102",
      workflow_state: {
        atlasEligibilitySource: "CTWA_REFERRAL",
        manualAgentOwnership: true,
        humanTakenOverAt: "2026-09-01T14:00:00.000Z"
      }
    }),
    ctwaLead({
      id: "p-na",
      phone: "+17865551103",
      workflow_state: {
        atlasEligibilitySource: "CTWA_REFERRAL",
        needsHumanAttention: true
      }
    }),
    prospect({
      id: "p-meta",
      phone: "+17865551104",
      workflow_state: { atlasEligibilitySource: "META_AD_DESTINATION" }
    })
  ];
  const counts = buildConversationPerformanceCounts(rows);
  assert.equal(counts.atlas, 1);
  assert.equal(counts.human, 1);
  assert.equal(counts.needsAttention, 1);
  assert.equal(counts.total, counts.atlas + counts.human + counts.needsAttention);
  const statuses = counts.members.map((row) => row.status).sort();
  assert.deepEqual(statuses, [
    CONVERSATION_OWNERSHIP_STATE.ATLAS,
    CONVERSATION_OWNERSHIP_STATE.HUMAN,
    CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION
  ]);
});

test("archived / closed / scheduled inbox rows are excluded from Active total", () => {
  const archived = ctwaLead({
    id: "p-archived",
    phone: "+17865551120",
    workflow_state: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      inboxArchivedAt: "2026-09-01T15:00:00.000Z"
    }
  });
  const closed = ctwaLead({
    id: "p-closed",
    phone: "+17865551121",
    workflow_state: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      inboxClosedAt: "2026-09-01T15:00:00.000Z"
    }
  });
  const scheduled = ctwaLead({
    id: "p-scheduled",
    phone: "+17865551122",
    current_step: "CONFIRMED",
    workflow_state: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      canonicalMilestone: "INTERVIEW_SCHEDULED"
    }
  });
  const counts = buildConversationPerformanceCounts([archived, closed, scheduled]);
  assert.equal(counts.total, 0);
  assert.equal(counts.excluded, 3);
});

test("prospect rows override the unfiltered Mission Control queue", () => {
  const queue = Array.from({ length: 87 }, (_, index) => ({
    phone: `+17865552${String(index).padStart(3, "0")}`,
    needsHumanAttention: index < 67,
    workflowOwnership: "ATLAS"
  }));
  const result = buildConversationOwnership(queue, [
    ctwaLead({
      id: "p-live",
      phone: "+17865551099",
      workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
    })
  ]);
  assert.equal(result.total, 1);
  assert.equal(result.atlas, 1);
  assert.equal(result.needsAttention, 0);
  assert.equal(result.averageResponseTimeMs, null);
});

test("J) BR-199 / BR-201 provenance tests remain in the suite", () => {
  const br199 = fs.readFileSync(
    path.join(__dirname, "operationalLeadEligibilityBr199.test.js"),
    "utf8"
  );
  const br201 = fs.readFileSync(
    path.join(__dirname, "operationalLeadProvenanceBr201.test.js"),
    "utf8"
  );
  assert.match(br199, /BR-199/);
  assert.match(br201, /META_AD_DESTINATION-only is not operational/);
});
