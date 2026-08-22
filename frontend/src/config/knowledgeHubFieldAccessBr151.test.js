/**
 * BR-151 — Frontend Knowledge Hub route/nav gates + i18n catalog safety.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES, PERMISSIONS, roleHasPermission } from "../security/workspacePermissions.js";
import { translations } from "../i18n/translations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(path.join(__dirname, "workspaceExperience.js"), "utf8");
const knowledgeHubSource = fs.readFileSync(
  path.join(__dirname, "../pages/KnowledgeHub.jsx"),
  "utf8"
);
const languageContextSource = fs.readFileSync(
  path.join(__dirname, "../i18n/LanguageContext.jsx"),
  "utf8"
);

test("BR-151 permission matrix mirrors backend intent", () => {
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.KNOWLEDGE_READ), true);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.KNOWLEDGE_WRITE), false);
  assert.equal(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.KNOWLEDGE_READ), true);
  assert.equal(roleHasPermission(ROLES.AGENT, PERMISSIONS.KNOWLEDGE_READ), true);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.KNOWLEDGE_WRITE), true);
});

test("BR-151 knowledge route gated by knowledge:read", () => {
  const routeBlock = workspaceSource.match(
    /knowledge:\s*\{[^}]*permission:\s*PERMISSIONS\.([A-Z_]+)/
  );
  assert.ok(routeBlock, "knowledge ROUTE_ACCESS present");
  assert.equal(routeBlock[1], "KNOWLEDGE_READ");

  const navBlock = workspaceSource.match(
    /knowledge:\s*\{[\s\S]*?labelKey:\s*"navKnowledge"[\s\S]*?permission:\s*PERMISSIONS\.([A-Z_]+)/
  );
  assert.ok(navBlock, "knowledge nav present");
  assert.equal(navBlock[1], "KNOWLEDGE_READ");
});

test("BR-151 KnowledgeHub exposes forbidden and error status cards", () => {
  assert.match(knowledgeHubSource, /forbiddenError/);
  assert.match(knowledgeHubSource, /knowledgeHubForbidden/);
  assert.match(knowledgeHubSource, /knowledge-hub__status-card--error/);
  assert.match(knowledgeHubSource, /knowledgeHubTreeEmpty/);
  assert.match(knowledgeHubSource, /knowledgeHubEmptyState/);
});

test("BR-151 LanguageContext exposes translation catalog as t", () => {
  assert.match(languageContextSource, /\bt:\s*catalog/);
});

test("BR-151 Spanish knowledgeHubTitle present (Misleisys locale)", () => {
  assert.equal(typeof translations.es.knowledgeHubTitle, "string");
  assert.ok(translations.es.knowledgeHubTitle.length > 0);
  assert.equal(typeof translations.en.knowledgeHubTitle, "string");
});
