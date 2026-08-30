import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  casesForTab,
  doesNotExposeChainOfThought,
  formatPercent,
  formatUsd
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

test("case payloads must not expose hidden reasoning", () => {
  assert.equal(
    doesNotExposeChainOfThought({
      semanticInterpretation: { intent: "provide_location" }
    }),
    true
  );
  assert.equal(doesNotExposeChainOfThought({ chainOfThought: "secret" }), false);
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
