/**
 * BR-153 — Field UX polish, storage cleanup, display helpers.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  enrichArticleForDisplay,
  getArticleDisplayTitle,
  isLegacyEngineeringPath,
  isValidAgentLibraryPath,
  titleCaseFromFilename
} from "../utils/knowledgeDisplay.js";
import {
  syncKnowledgeActivityWithCatalog,
  readKnowledgeActivity
} from "../utils/knowledgeStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeHubSource = fs.readFileSync(
  path.join(__dirname, "../pages/KnowledgeHub.jsx"),
  "utf8"
);
const storageSource = fs.readFileSync(
  path.join(__dirname, "../utils/knowledgeStorage.js"),
  "utf8"
);

const catalogFiles = [
  {
    path: "scripts-objection-handling/is-this-sales",
    displayTitle: '"Is This Sales?" — How to Respond',
    shortSummary: "Short script",
    categoryId: "scripts-objection-handling",
    categoryLabelKey: "knowledgeCategoryScripts",
    updatedAt: "2026-08-01T00:00:00.000Z",
    estimatedReadTime: "3 min"
  }
];

const t = {
  knowledgeHubTitle: "Knowledge Hub",
  knowledgeCategoryScripts: "Scripts & Objection Handling",
  knowledgeHubReadTimeMinutes: "{minutes} min read"
};

test("BR-153 legacy engineering paths rejected", () => {
  assert.equal(isLegacyEngineeringPath("CURRENT_STATE.md"), true);
  assert.equal(isLegacyEngineeringPath("03-engineering/KNOWLEDGE_HUB.md"), true);
  assert.equal(isLegacyEngineeringPath("scripts-objection-handling/is-this-sales"), false);
});

test("BR-153 storage v3 purges stale engineering history", () => {
  assert.match(storageSource, /atlas_knowledge_activity_v3/);
  const state = readKnowledgeActivity(catalogFiles);
  assert.equal(
    state.recentlyViewed.every((item) => isValidAgentLibraryPath(item.path)),
    true
  );
});

test("BR-153 syncKnowledgeActivityWithCatalog drops invalid favorites", () => {
  const initial = {
    recentlyOpened: [],
    recentlyViewed: [
      { path: "CURRENT_STATE.md", title: "CURRENT_STATE.md" },
      { path: "scripts-objection-handling/is-this-sales", title: "Old title" }
    ],
    pinned: [{ path: "00-executive/SPRINT.md", title: "Sprint 16" }],
    favorites: [],
    viewCounts: {
      "CURRENT_STATE.md": 4,
      "scripts-objection-handling/is-this-sales": 2
    }
  };
  globalThis.localStorage = {
    store: { atlas_knowledge_activity_v3: JSON.stringify(initial) },
    getItem(key) {
      return this.store[key] || null;
    },
    setItem(key, value) {
      this.store[key] = value;
    },
    removeItem(key) {
      delete this.store[key];
    }
  };
  const state = syncKnowledgeActivityWithCatalog(catalogFiles);
  assert.equal(state.recentlyViewed.length, 1);
  assert.equal(state.recentlyViewed[0].displayTitle, catalogFiles[0].displayTitle);
  assert.equal(state.pinned.length, 0);
  assert.equal(state.viewCounts["CURRENT_STATE.md"], undefined);
  assert.equal(state.viewCounts["scripts-objection-handling/is-this-sales"], 2);
});

test("BR-153 field UI hides raw paths", () => {
  assert.doesNotMatch(knowledgeHubSource, /knowledge-hub__recent-path/);
  assert.doesNotMatch(knowledgeHubSource, /knowledge-hub__path/);
  assert.match(knowledgeHubSource, /knowledgeHubArticleUnavailable/);
  assert.match(knowledgeHubSource, /viewMode === "unavailable"/);
});

test("BR-153 breadcrumbs and article cards present", () => {
  const libraryHomeSource = fs.readFileSync(
    path.join(__dirname, "../components/knowledge/KnowledgeHubLibraryHome.jsx"),
    "utf8"
  );
  assert.match(knowledgeHubSource, /KnowledgeHubArticleView/);
  assert.match(knowledgeHubSource, /ArticleCard/);
  assert.match(libraryHomeSource, /KnowledgeHubBreadcrumbs/);
});

test("BR-153 display helpers produce friendly titles", () => {
  assert.equal(
    getArticleDisplayTitle({ displayTitle: "Quick Capture Guide" }),
    "Quick Capture Guide"
  );
  assert.equal(titleCaseFromFilename("interview-checklist.md"), "Interview Checklist");
  const enriched = enrichArticleForDisplay(catalogFiles[0], t, "en-US");
  assert.equal(enriched.displayTitle, catalogFiles[0].displayTitle);
  assert.equal(enriched.categoryLabel, t.knowledgeCategoryScripts);
  assert.ok(enriched.readTimeLabel);
});
