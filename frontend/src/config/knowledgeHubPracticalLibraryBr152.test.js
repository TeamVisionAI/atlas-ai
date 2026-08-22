/**
 * BR-152 — Frontend practical library UX + tenant nav gate.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWLEDGE_HUB_CATEGORIES } from "../config/knowledgeHubCategories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(path.join(__dirname, "workspaceExperience.js"), "utf8");
const mainLayoutSource = fs.readFileSync(
  path.join(__dirname, "../layouts/MainLayout.jsx"),
  "utf8"
);
const knowledgeHubSource = fs.readFileSync(
  path.join(__dirname, "../pages/KnowledgeHub.jsx"),
  "utf8"
);
const libraryHomeSource = fs.readFileSync(
  path.join(__dirname, "../components/knowledge/KnowledgeHubLibraryHome.jsx"),
  "utf8"
);
const tenantControlsSource = fs.readFileSync(
  path.join(__dirname, "../../../backend/core/tenantFeatureControls.js"),
  "utf8"
);

test("BR-152 frontend defines six categories", () => {
  assert.equal(KNOWLEDGE_HUB_CATEGORIES.length, 6);
});

test("BR-152 nav hides knowledge when knowledgeHubAllowed is false", () => {
  assert.match(workspaceSource, /knowledgeHubAllowed/);
  assert.match(workspaceSource, /def\.id === "knowledge" && knowledgeHubAllowed === false/);
});

test("BR-152 MainLayout resolves knowledge hub access for nav", () => {
  assert.match(mainLayoutSource, /getKnowledgeHubAccess/);
  assert.match(mainLayoutSource, /knowledgeHubAllowed/);
});

test("BR-152 library home renders category cards and lists", () => {
  assert.match(libraryHomeSource, /knowledge-library__grid/);
  assert.match(libraryHomeSource, /knowledgeHubRecentlyUpdated/);
  assert.match(libraryHomeSource, /knowledgeHubMostUsed/);
});

test("BR-152 KnowledgeHub has back navigation and not-enabled state", () => {
  assert.match(knowledgeHubSource, /knowledgeHubBackToHub/);
  assert.match(knowledgeHubSource, /knowledgeHubNotEnabled/);
  assert.match(knowledgeHubSource, /KnowledgeHubLibraryHome/);
});

test("BR-152 tenant feature knowledgeHubEnabled registered", () => {
  assert.match(tenantControlsSource, /knowledgeHubEnabled/);
});
