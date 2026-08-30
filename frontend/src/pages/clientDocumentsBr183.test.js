/**
 * BR-183 — Client Documents section wiring. Source scans only.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { buildDocumentDueLabel, presentDocumentHistoryEvent } from "../engines/documentsViewModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("document history never shows a raw actor UUID", () => {
  const translate = (key) => key;
  assert.equal(buildDocumentDueLabel("overdue", translate), "serviceDueOverdue");
  const event = presentDocumentHistoryEvent(
    {
      actor: "41000000-0000-4000-8000-000000000001",
      actorName: "Former teammate",
      at: "2026-08-30T16:00:00.000Z",
      summary: "Document uploaded"
    },
    translate,
    "en-US"
  );
  assert.equal(event.actorLabel, "Former teammate");
  assert.doesNotMatch(event.actorLabel, /[0-9a-f]{8}-[0-9a-f]{4}/i);
});

test("Client Workspace loads documents separately and does not couple recruiting", () => {
  const clients = fs.readFileSync(path.join(here, "ClientsPage.jsx"), "utf8");
  const service = fs.readFileSync(path.join(here, "ServiceRecordsBlock.jsx"), "utf8");
  const translations = fs.readFileSync(path.join(here, "../i18n/translations.js"), "utf8");
  const api = fs.readFileSync(path.join(here, "../services/clientDocumentsService.js"), "utf8");

  assert.match(clients, /getDocumentRequests\(\{ clientId/);
  assert.match(clients, /getDocuments\(\{ clientId/);
  assert.match(clients, /documentsSectionTitle/);
  assert.match(clients, /documentsRequestAdd/);
  assert.match(service, /linkedRequests/);
  assert.match(service, /linkedDocuments/);
  assert.doesNotMatch(clients, /navigateToProspectWorkspace|recruitAiV2|\/api\/prospects/);
  assert.match(translations, /documentsSectionTitle: "Documents"/);
  assert.match(api, /\/api\/documents\/upload/);
  assert.match(api, /\/api\/document-requests/);
});
