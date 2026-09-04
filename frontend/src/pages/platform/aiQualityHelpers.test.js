import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_QUALITY_TABS,
  LEARNING_ACTIONS,
  casesForTab,
  doesNotExposeChainOfThought,
  formatPercent,
  formatUsd,
  isRegressionApprovable,
  INSUFFICIENT_EVIDENCE_MESSAGE
} from "./aiQualityHelpers.js";
import { canAccessAiQualityPage } from "../../security/platformAccess.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("helpers format metrics and filter tabs", () => {
  assert.equal(formatPercent(0.256), "25.6%");
  assert.equal(formatUsd(0.01234), "$0.0123");
  const rows = [
    { signalType: "SEMANTIC_DISAGREEMENT", status: "NEW" },
    { signalType: "REPEATED_QUESTION", status: "NEW" },
    { signalType: "SEMANTIC_DISAGREEMENT", status: "REGRESSION_CANDIDATE" }
  ];
  assert.equal(casesForTab(rows, "disagreements").length, 2);
  assert.equal(casesForTab(rows, "attention").length, 1);
  assert.equal(casesForTab(rows, "regressions").length, 1);
});

test("Learning & Improvements tab is registered", () => {
  assert.equal(
    AI_QUALITY_TABS.some((item) => item.id === "learning"),
    true
  );
  assert.equal(
    LEARNING_ACTIONS.some((item) => item.id === "authorize_implementation"),
    true
  );
  const page = fs.readFileSync(path.join(here, "AiQualityPage.jsx"), "utf8");
  assert.match(page, /Learning & Improvements/);
  assert.match(page, /LEARNING_ACTIONS/);
  assert.match(page, /runLearningAction/);
  assert.match(page, /Semantic apply stays off/);
  assert.doesNotMatch(page, /chainOfThought/);
});

test("case payloads must not expose hidden reasoning", () => {
  assert.equal(
    doesNotExposeChainOfThought({
      semanticInterpretation: { intent: "provide_location" }
    }),
    true
  );
  assert.equal(doesNotExposeChainOfThought({ chainOfThought: "secret" }), false);
});

test("Approve Regression is not approvable on insufficient evidence", () => {
  assert.equal(
    isRegressionApprovable({
      evidenceStatus: "INSUFFICIENT",
      regressionApprovable: false
    }),
    false
  );
  assert.equal(
    isRegressionApprovable({
      evidenceStatus: "SUFFICIENT",
      regressionApprovable: true,
      conversationTurns: [{ id: "t1" }]
    }),
    true
  );
  assert.match(INSUFFICIENT_EVIDENCE_MESSAGE, /Insufficient evidence to approve this regression/);
  const page = fs.readFileSync(path.join(here, "AiQualityPage.jsx"), "utf8");
  assert.match(page, /isRegressionApprovable/);
  assert.match(page, /approve_regression/);
  assert.match(page, /disabled=\{item\.id === "approve_regression"/);
});

test("only Super Admin can open AI Quality", () => {
  assert.equal(canAccessAiQualityPage({ saasRole: "ADMIN" }), false);
  assert.equal(canAccessAiQualityPage({ saasRole: "SUPER_ADMIN" }), true);
  assert.equal(canAccessAiQualityPage({ role: "representative" }), false);
});

test("app shell registers Super Admin AI Quality route", () => {
  const app = fs.readFileSync(path.join(here, "../../App.jsx"), "utf8");
  const experience = fs.readFileSync(path.join(here, "../../config/workspaceExperience.js"), "utf8");
  assert.match(app, /path="platform\/ai-quality"/);
  assert.match(app, /AiQualityPage/);
  assert.match(experience, /platformAiQuality/);
  assert.match(experience, /navAiQuality/);
  assert.match(experience, /"platform\/ai-quality"/);
});
