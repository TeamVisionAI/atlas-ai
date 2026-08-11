/**
 * BR-136 — Mission Control operational TEST exclusion (Meta-safe).
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  isOperationalTestProspectForMissionControl,
  isMetaReviewDemoProspect,
  filterOutOperationalTestProspects
} = require("../core/missionControlOperationalTestFilter");
const {
  isTestProspect
} = require("../core/conversationsCenter/conversationsCenterLifecycle");

test("durable inboxMarkedTestAt excludes from MC", () => {
  assert.equal(
    isOperationalTestProspectForMissionControl({
      phone: "+17865557001",
      source: "whatsapp",
      workflow_state: { inboxMarkedTestAt: "2026-08-11T00:00:00.000Z" }
    }),
    true
  );
});

test("exact TEST / CANARY / QA source or entry excludes from MC", () => {
  assert.equal(
    isOperationalTestProspectForMissionControl({
      phone: "+17865557002",
      source: "TEST"
    }),
    true
  );
  assert.equal(
    isOperationalTestProspectForMissionControl({
      phone: "+17865557003",
      entry_method: "CANARY"
    }),
    true
  );
  assert.equal(
    isOperationalTestProspectForMissionControl({
      phone: "+17865557004",
      source: "QA"
    }),
    true
  );
});

test("META_REVIEW demos are never operational TEST for MC", () => {
  const demo = {
    phone: "3055550101",
    source: "META_REVIEW",
    entry_method: "META_REVIEW_DEMO",
    workflow_state: { inboxMarkedTestAt: "2026-08-11T00:00:00.000Z" }
  };
  assert.equal(isMetaReviewDemoProspect(demo), true);
  assert.equal(isOperationalTestProspectForMissionControl(demo), false);
  // Conversations may still classify them as TEST for the Niovel inbox.
  assert.equal(isTestProspect(demo, demo.workflow_state), true);
});

test("ordinary whatsapp prospect remains eligible", () => {
  assert.equal(
    isOperationalTestProspectForMissionControl({
      phone: "+17862347083",
      source: "whatsapp",
      workflow_state: {}
    }),
    false
  );
});

test("clearing durable TEST restores MC eligibility", () => {
  const phone = "+17865557010";
  const marked = {
    phone,
    source: "whatsapp",
    workflow_state: { inboxMarkedTestAt: "2026-08-11T00:00:00.000Z" }
  };
  assert.equal(isOperationalTestProspectForMissionControl(marked), true);

  const restored = {
    phone,
    source: "whatsapp",
    workflow_state: { inboxMarkedTestAt: null }
  };
  assert.equal(isOperationalTestProspectForMissionControl(restored), false);
});

test("filterOut removes operational TEST but keeps Meta demos + live", () => {
  const rows = [
    {
      phone: "+17865557101",
      source: "whatsapp",
      name: "Live"
    },
    {
      phone: "+17865557102",
      source: "whatsapp",
      workflow_state: { inboxMarkedTestAt: "2026-08-11T00:00:00.000Z" },
      name: "MarkedTest"
    },
    {
      phone: "3055550101",
      source: "META_REVIEW",
      entry_method: "META_REVIEW_DEMO",
      name: "Maria"
    },
    {
      phone: "+17865557103",
      source: "CANARY",
      name: "Canary"
    }
  ];

  const filtered = filterOutOperationalTestProspects(rows);
  assert.deepEqual(
    filtered.map((r) => r.name).sort(),
    ["Live", "Maria"]
  );
});

test("priority queue module wires BR-136 filter before ranking", () => {
  const engineSrc = fs.readFileSync(
    path.join(__dirname, "../core/missionControlPriorityEngine.js"),
    "utf8"
  );
  assert.match(engineSrc, /filterOutOperationalTestProspects/);
  assert.match(engineSrc, /BR-136/);
});

test("loadProductionProspects and latest-active path wire BR-136", () => {
  const ed = fs.readFileSync(
    path.join(__dirname, "../core/executiveDashboardReadModel.js"),
    "utf8"
  );
  const supabase = fs.readFileSync(
    path.join(__dirname, "../services/supabaseService.js"),
    "utf8"
  );
  assert.match(ed, /filterOutOperationalTestProspects/);
  assert.match(supabase, /filterOutOperationalTestProspects/);
});

test("docs: BR-136 present; Meta safety constraints", () => {
  const docs = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(docs, /## BR-136/);
  assert.match(docs, /META_REVIEW/);
  assert.match(docs, /Do not call Conversations `isTestProspect\(\)`|do not reuse `isTestProspect`/i);
});

test("implementation does not import Conversations lifecycle TEST helper", () => {
  const filterSrc = fs.readFileSync(
    path.join(__dirname, "../core/missionControlOperationalTestFilter.js"),
    "utf8"
  );
  const engineSrc = fs.readFileSync(
    path.join(__dirname, "../core/missionControlPriorityEngine.js"),
    "utf8"
  );
  assert.doesNotMatch(filterSrc, /conversationsCenterLifecycle|require\(["'].*isTest/);
  assert.doesNotMatch(engineSrc, /conversationsCenterLifecycle/);
});

test("Meta Review allowlist / mode files unchanged by this change", () => {
  const root = path.join(__dirname, "../..");
  for (const rel of [
    "frontend/src/config/metaReviewMode.js",
    "frontend/src/config/workspaceExperience.js",
    "backend/config/metaReviewMode.js",
    "backend/middleware/requireMetaReviewMode.js"
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
  }
  const workspace = fs.readFileSync(
    path.join(root, "frontend/src/config/workspaceExperience.js"),
    "utf8"
  );
  assert.match(workspace, /META_REVIEW_ALLOWED_ROUTE_KEYS/);
  assert.match(workspace, /"conversations"/);
});

test("execution remains OFF", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  assert.equal(isExecutionEnabled(process.env), false);
});
