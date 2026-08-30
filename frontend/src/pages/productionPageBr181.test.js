/**
 * BR-181 — Production page and Client Workspace wiring. Source scans only.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { formatProductionAmount, presentProductionHistoryEvent } from "../engines/productionViewModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("production amount formatter never invents a value", () => {
  assert.equal(formatProductionAmount(null), null);
  assert.equal(formatProductionAmount(""), null);
  assert.equal(formatProductionAmount("not-a-number"), null);
  assert.match(formatProductionAmount(150, "en-US"), /150/);
});

test("history presentation never shows a raw actor UUID", () => {
  const event = presentProductionHistoryEvent(
    {
      actor: "41000000-0000-4000-8000-000000000001",
      actorName: "Former teammate",
      at: "2026-08-30T16:00:00.000Z",
      summary: "Production record created"
    },
    (key) => key,
    "en-US"
  );
  assert.equal(event.actorLabel, "Former teammate");
  assert.doesNotMatch(event.actorLabel, /[0-9a-f]{8}-[0-9a-f]{4}/i);
});

test("Production is routed next to Clients and Client Workspace loads production separately", () => {
  const app = fs.readFileSync(path.join(here, "../App.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(here, "../config/workspaceExperience.js"), "utf8");
  const page = fs.readFileSync(path.join(here, "ProductionPage.jsx"), "utf8");
  const clients = fs.readFileSync(path.join(here, "ClientsPage.jsx"), "utf8");
  const translations = fs.readFileSync(path.join(here, "../i18n/translations.js"), "utf8");

  assert.match(app, /path="production" element=\{<ProductionPage/);
  assert.match(nav, /"clients",\s*"production"/);
  assert.match(nav, /permission: PERMISSIONS.PROSPECT_READ/);
  assert.match(page, /getProductionList\(/);
  assert.match(page, /productionScopeMine/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|recruitAiV2|\/api\/prospects/);
  assert.match(clients, /getProductionList\(\{ clientId/);
  assert.match(clients, /productionSectionTitle/);
  assert.doesNotMatch(clients, /navigateToProspectWorkspace/);
  assert.match(translations, /productionScopeMine: "My Production"/);
  assert.match(translations, /productionSectionTitle: "Production \/ Activity"/);
});
