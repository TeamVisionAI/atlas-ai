/**
 * BR-080 — Prospect Center operational acknowledgement vs New lifecycle.
 * Atlas/human first response hides Acknowledge; lifecycle New may remain.
 */

"use strict";

require("dotenv").config({
  path: require("node:path").join(__dirname, "../../.env")
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  isLifecycleNew,
  isOperationallyAcknowledged,
  needsManualAcknowledge
} = require("../core/newLeadAttentionEngine");
const { buildProspectCenterItem } = require("../core/prospectCenterReadModel");
const {
  resolveExecutiveFilterPhones,
  EXECUTIVE_FILTERS
} = require("../core/executiveFilterResolver");

const OWNER = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function prospect(overrides = {}) {
  return {
    id: "p-operational-ack",
    phone: "+14075550176",
    name: "Operational Ack Prospect",
    organization_id: "00000000-0000-4000-8000-000000000001",
    owner_user_id: OWNER,
    current_step: "NEW",
    status: "NEW",
    attention_status: "new",
    acknowledged_at: null,
    new_lead_received_at: "2026-08-30T11:32:19.000Z",
    created_at: "2026-08-30T11:32:19.000Z",
    ...overrides
  };
}

function itemFor(row) {
  return buildProspectCenterItem(row, {
    phone: row.phone,
    name: row.name,
    canonicalMilestone: "NEW_LEAD",
    currentStep: row.current_step,
    missionControlPriority: 2,
    needsHumanAttention: false,
    workflowOwnership: "ATLAS",
    stalledAt: null
  });
}

test("New + no response → Acknowledge visible, lifecycle New", () => {
  const row = prospect();
  assert.equal(isLifecycleNew(row), true);
  assert.equal(isOperationallyAcknowledged(row), false);
  assert.equal(needsManualAcknowledge(row), true);

  const item = itemFor(row);
  assert.equal(item.badges.new, true);
  assert.equal(item.badges.needsManualAcknowledge, true);
  assert.equal(item.needsManualAcknowledge, true);
});

test("New + Atlas delivered reply → Acknowledge hidden, lifecycle New remains", () => {
  const row = prospect({ attention_status: "waiting_for_prospect" });
  assert.equal(isLifecycleNew(row), true);
  assert.equal(isOperationallyAcknowledged(row), true);
  assert.equal(needsManualAcknowledge(row), false);

  const item = itemFor(row);
  assert.equal(item.badges.new, true);
  assert.equal(item.isNew, true);
  assert.equal(item.badges.needsManualAcknowledge, false);
  assert.equal(item.currentStep, "NEW");
});

test("ai_responding is also operationally acknowledged", () => {
  const row = prospect({ attention_status: "ai_responding" });
  assert.equal(isOperationallyAcknowledged(row), true);
  assert.equal(needsManualAcknowledge(row), false);
  assert.equal(itemFor(row).badges.needsManualAcknowledge, false);
});

test("New + human reply (TAKE OVER / acknowledged_at) → Acknowledge hidden, New remains", () => {
  const row = prospect({
    attention_status: "acknowledged",
    acknowledged_at: "2026-08-30T11:40:00.000Z"
  });
  assert.equal(isLifecycleNew(row), true);
  assert.equal(isOperationallyAcknowledged(row), true);
  assert.equal(needsManualAcknowledge(row), false);

  const item = itemFor(row);
  assert.equal(item.badges.new, true);
  assert.equal(item.badges.needsManualAcknowledge, false);
  assert.equal(item.acknowledgedAt, "2026-08-30T11:40:00.000Z");
});

test("provider send failure stays unacknowledged and Human Attention", () => {
  const row = prospect({
    attention_status: "human_required",
    human_attention_reason: "provider_send_failed"
  });
  assert.equal(isOperationallyAcknowledged(row), false);
  assert.equal(needsManualAcknowledge(row), true);

  const item = buildProspectCenterItem(row, {
    phone: row.phone,
    name: row.name,
    canonicalMilestone: "NEW_LEAD",
    currentStep: "NEW",
    missionControlPriority: 1,
    needsHumanAttention: true,
    workflowOwnership: "AGENT",
    stalledAt: null
  });
  assert.equal(item.badges.needsManualAcknowledge, true);
  assert.equal(item.badges.humanAttention, true);
  assert.equal(item.badges.new, true);
});

test("new-unacknowledged filter excludes Atlas-waiting and explicit ack", () => {
  const unattended = prospect({ phone: "+1" });
  const atlasWaiting = prospect({
    phone: "+2",
    attention_status: "waiting_for_prospect"
  });
  const humanAcked = prospect({
    phone: "+3",
    attention_status: "acknowledged",
    acknowledged_at: "2026-08-30T11:40:00.000Z"
  });
  const failed = prospect({
    phone: "+4",
    attention_status: "human_required",
    human_attention_reason: "provider_send_failed"
  });
  const rows = [unattended, atlasWaiting, humanAcked, failed];
  const queue = rows.map((row) => ({ phone: row.phone, needsHumanAttention: false }));
  assert.deepEqual(
    resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.NEW_UNACKNOWLEDGED, rows, queue),
    ["+1", "+4"]
  );
});

test("Prospect Center actions use needsManualAcknowledge, not New badge", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/ProspectCenter.jsx"),
    "utf8"
  );
  assert.match(page, /needsManualAcknowledge/);
  assert.match(page, /needsAck && !badges.unassigned/);
  assert.match(page, /badges.unassigned && needsAck/);
});
