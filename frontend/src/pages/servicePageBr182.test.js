/**
 * BR-182 — Service page and Client Workspace wiring. Source scans only.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { buildServiceDueLabel, presentServiceHistoryEvent } from "../engines/serviceViewModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("service due labels stay date-based and history never shows a raw actor UUID", () => {
  const translate = (key) => key;
  assert.equal(buildServiceDueLabel("needs-date", translate), "serviceDueNeedsDate");
  const event = presentServiceHistoryEvent(
    {
      actor: "41000000-0000-4000-8000-000000000001",
      actorName: "Former teammate",
      at: "2026-08-30T16:00:00.000Z",
      summary: "Service case created"
    },
    translate,
    "en-US"
  );
  assert.equal(event.actorLabel, "Former teammate");
  assert.doesNotMatch(event.actorLabel, /[0-9a-f]{8}-[0-9a-f]{4}/i);
});

test("Service is routed next to Production and Client Workspace loads service separately", () => {
  const app = fs.readFileSync(path.join(here, "../App.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(here, "../config/workspaceExperience.js"), "utf8");
  const page = fs.readFileSync(path.join(here, "ServicePage.jsx"), "utf8");
  const clients = fs.readFileSync(path.join(here, "ClientsPage.jsx"), "utf8");
  const translations = fs.readFileSync(path.join(here, "../i18n/translations.js"), "utf8");

  assert.match(app, /path="service" element=\{<ServicePage/);
  assert.match(nav, /"production",\s*"service"/);
  assert.match(page, /getServiceCases\(/);
  assert.match(page, /serviceScopeMine/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|recruitAiV2|\/api\/prospects/);
  assert.match(clients, /getServiceCases\(\{ clientId/);
  assert.match(clients, /serviceSectionTitle/);
  assert.match(translations, /serviceScopeMine: "My Service"/);
});
