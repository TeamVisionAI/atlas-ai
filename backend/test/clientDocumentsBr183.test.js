/**
 * BR-183 — Client Documents & Secure Document Requests.
 * Synthetic fixtures only. No live tenant data, WhatsApp, SMS, or email.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const clientDocumentsApplicationService = require("../application/clientDocumentsApplicationService");
const followUpApplicationService = require("../application/followUpApplicationService");
const todayService = require("../application/todayActionCenterApplicationService");
const { createMemoryFollowUpStore } = require("../core/followUps");
const {
  emptyDocumentRequests,
  emptyDocumentDetail
} = require("../core/operationalControlPlane");
const {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_REQUEST_STATUSES,
  DOCUMENT_DUE_STATUSES,
  createMemoryDocumentStore,
  createMemoryDocumentRequestStore,
  createMemoryObjectStorage,
  sanitizeOriginalFilename,
  assertUploadConstraints
} = require("../core/clientDocuments");

const ORG_A = "21000000-0000-4000-8000-000000000001";
const ORG_B = "21000000-0000-4000-8000-000000000099";
const USER_A = "41000000-0000-4000-8000-000000000001";
const USER_B = "41000000-0000-4000-8000-000000000002";
const CLIENT_ID = "32000000-0000-4000-8000-000000000001";
const SERVICE_ID = "52000000-0000-4000-8000-000000000001";
const NAMES = new Map([[USER_A, "Alex Owner"]]);
const TODAY = "2026-08-30";

function pdfBuffer() {
  return Buffer.from("%PDF-1.4 synthetic");
}

function auth(userId = USER_A, extras = {}) {
  return { userId, role: extras.role || "agent", ...extras };
}

function clientSeed(overrides = {}) {
  return {
    id: CLIENT_ID,
    organizationId: ORG_A,
    ownerUserId: USER_A,
    name: "Alex Client",
    phone: "+15550001111",
    ...overrides
  };
}

function installStores() {
  const documents = createMemoryDocumentStore();
  const requests = createMemoryDocumentRequestStore();
  const storage = createMemoryObjectStorage();
  const clients = new Map([[CLIENT_ID, clientSeed()]]);
  const services = new Map([
    [
      SERVICE_ID,
      { id: SERVICE_ID, organizationId: ORG_A, clientId: CLIENT_ID, serviceType: "POLICY_REVIEW" }
    ]
  ]);
  clientDocumentsApplicationService.setStoresForTests({
    documents,
    requests,
    storage,
    findClient: async (id, organizationId) => {
      const row = clients.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    findServiceCase: async (id, organizationId) => {
      const row = services.get(id);
      if (!row || row.organizationId !== organizationId) return null;
      return row;
    },
    findProduction: async () => null
  });
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
  return { documents, requests, storage };
}

test.beforeEach(() => {
  installStores();
});

test.afterEach(() => {
  clientDocumentsApplicationService.setStoresForTests({});
  followUpApplicationService.setStoreForTests(null);
  todayService.setSourcesForTests(null);
});

test("create document request keeps a null due date as Needs Date", async () => {
  const created = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      documentType: DOCUMENT_TYPES.POLICY_DOCUMENT,
      title: "Policy packet",
      nameById: NAMES,
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  assert.equal(created.clientId, CLIENT_ID);
  assert.equal(created.documentType, "POLICY_DOCUMENT");
  assert.equal(created.status, "OPEN");
  assert.equal(created.dueDate, null);
  assert.equal(created.dueStatus, DOCUMENT_DUE_STATUSES.NEEDS_DATE);
  assert.equal(created.history[0].type, "request_created");
  assert.equal(created.history[0].actorName, "Alex Owner");
});

test("due dates classify as Needs Date, Due Today, Overdue, and Upcoming without inventing dates", async () => {
  const undated = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Needs a date",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  const dueToday = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Due today",
      dueDate: TODAY,
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  const overdue = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Overdue",
      dueDate: "2026-08-20",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  const upcoming = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Upcoming",
      dueDate: "2026-09-10",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  assert.equal(undated.dueStatus, "needs-date");
  assert.equal(dueToday.dueStatus, "due-today");
  assert.equal(overdue.dueStatus, "overdue");
  assert.equal(upcoming.dueStatus, "upcoming");
  assert.equal(undated.dueDate, null);
});

test("authorized upload stores metadata without exposing a storage key", async () => {
  const uploaded = await clientDocumentsApplicationService.uploadDocument(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      documentType: DOCUMENT_TYPES.IDENTIFICATION,
      originalFilename: "../../id card.PDF",
      mimeType: "application/pdf",
      buffer: pdfBuffer(),
      nameById: NAMES
    },
    auth()
  );
  assert.equal(uploaded.status, DOCUMENT_STATUSES.RECEIVED);
  assert.equal(uploaded.originalFilename, "id card.pdf");
  assert.equal(uploaded.mimeType, "application/pdf");
  assert.equal(uploaded.storageKey, undefined);
  assert.equal(JSON.stringify(uploaded).includes("storageKey"), false);
  const listed = await clientDocumentsApplicationService.listDocuments({
    organizationId: ORG_A,
    authContext: auth(),
    clientId: CLIENT_ID,
    nameById: NAMES
  });
  assert.equal(listed.items.some((item) => item.id === uploaded.id), true);
});

test("wrong MIME, oversized files, and path filenames are rejected or sanitized", () => {
  assert.throws(
    () =>
      assertUploadConstraints({
        buffer: Buffer.from("MZ executable"),
        mimeType: "application/x-msdownload",
        filename: "payload.exe"
      }),
    (error) => error.publicCode === "DOCUMENT_TYPE_INVALID"
  );
  assert.throws(
    () =>
      assertUploadConstraints({
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1),
        mimeType: "application/pdf",
        filename: "big.pdf"
      }),
    (error) => error.publicCode === "DOCUMENT_TOO_LARGE"
  );
  assert.equal(sanitizeOriginalFilename("C:\\\\temp\\\\a/b\\\\policy.PDF", "application/pdf"), "policy.pdf");
});

test("upload with an explicit request fulfills once and stays idempotent", async () => {
  const request = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Need policy",
      documentType: DOCUMENT_TYPES.POLICY_DOCUMENT,
      serviceCaseId: SERVICE_ID,
      nameById: NAMES
    },
    auth()
  );
  const uploaded = await clientDocumentsApplicationService.uploadDocument(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      requestId: request.id,
      originalFilename: "policy.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer(),
      nameById: NAMES
    },
    auth()
  );
  assert.equal(uploaded.requestId, request.id);
  assert.equal(uploaded.serviceCaseId, SERVICE_ID);
  const fulfilled = await clientDocumentsApplicationService.getDocumentRequest(request.id, {
    organizationId: ORG_A,
    authContext: auth(),
    nameById: NAMES
  });
  assert.equal(fulfilled.status, DOCUMENT_REQUEST_STATUSES.RECEIVED);
  assert.equal(fulfilled.fulfilledDocumentId, uploaded.id);
  const again = await clientDocumentsApplicationService.linkDocumentToRequest(
    uploaded.id,
    request.id,
    { organizationId: ORG_A, nameById: NAMES },
    auth()
  );
  assert.equal(again.requestId, request.id);
  const after = await clientDocumentsApplicationService.getDocumentRequest(request.id, {
    organizationId: ORG_A,
    authContext: auth(),
    nameById: NAMES
  });
  assert.equal(after.fulfilledDocumentId, uploaded.id);
  assert.equal(after.history.filter((event) => event.type === "request_fulfilled").length, 1);
});

test("wrong organization and unauthorized peer fail closed as 404", async () => {
  const request = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Isolation"
    },
    auth()
  );
  const uploaded = await clientDocumentsApplicationService.uploadDocument(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      originalFilename: "id.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer()
    },
    auth()
  );
  await assert.rejects(
    () =>
      clientDocumentsApplicationService.getDocumentRequest(request.id, {
        organizationId: ORG_B,
        authContext: auth()
      }),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    () =>
      clientDocumentsApplicationService.downloadDocument(uploaded.id, {
        organizationId: ORG_A,
        authContext: auth(USER_B)
      }),
    (error) => error.statusCode === 404
  );
  await assert.rejects(
    () =>
      clientDocumentsApplicationService.getDocument(uploaded.id, {
        organizationId: ORG_A,
        authContext: auth(USER_B)
      }),
    (error) => error.statusCode === 404
  );
});

test("team visibility is only allowed through existing hierarchy", async () => {
  const created = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Owner request"
    },
    auth()
  );
  const peerTeam = await clientDocumentsApplicationService.listDocumentRequests({
    organizationId: ORG_A,
    authContext: auth(USER_B),
    scope: "team"
  });
  assert.equal(peerTeam.scope, "mine");
  assert.equal(peerTeam.items.some((item) => item.id === created.id), false);
  const team = await clientDocumentsApplicationService.listDocumentRequests({
    organizationId: ORG_A,
    authContext: auth(USER_B, {
      role: "manager",
      hierarchyMode: "subtree",
      hierarchyUserIds: [USER_B, USER_A]
    }),
    scope: "team"
  });
  assert.equal(team.scope, "team");
  assert.equal(team.items.some((item) => item.id === created.id), true);
});

test("Today includes overdue and due-today open requests but not Needs Date or documents", async () => {
  await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Overdue request",
      dueDate: "2026-08-20",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Needs date request",
      reference: new Date(`${TODAY}T16:00:00.000Z`)
    },
    auth()
  );
  await clientDocumentsApplicationService.uploadDocument(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      originalFilename: "note.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer()
    },
    auth()
  );
  todayService.setSourcesForTests({
    loadProspects: async () => [],
    loadAppointments: async () => [],
    listFollowUps: async () => ({ items: [] }),
    listNotifications: async () => [],
    listServiceCases: async () => ({ items: [] }),
    listDocumentRequests: (options) => clientDocumentsApplicationService.listDocumentRequests(options),
    timezoneDeps: {
      getOrganizationSettings: () => ({ timezone: "America/New_York" }),
      getOrganizationProfileTimezone: () => "America/New_York"
    }
  });
  const today = await todayService.getToday({
    organizationId: ORG_A,
    authContext: auth(),
    reference: new Date("2026-08-30T16:00:00.000Z")
  });
  const items = today.sections.followUps.filter((item) => item.kind === "document_request");
  assert.equal(items.some((item) => item.title === "Overdue request"), true);
  assert.equal(items.some((item) => item.title === "Needs date request"), false);
  assert.equal(items.every((item) => item.href === `/app/clients/${CLIENT_ID}`), true);
});

test("manual follow-up reuses BR-178 and status changes do not auto-create follow-ups", async () => {
  const request = await clientDocumentsApplicationService.createDocumentRequest(
    {
      organizationId: ORG_A,
      clientId: CLIENT_ID,
      title: "Docs"
    },
    auth()
  );
  await clientDocumentsApplicationService.updateRequestStatus(
    request.id,
    { organizationId: ORG_A, status: DOCUMENT_REQUEST_STATUSES.CANCELLED },
    auth()
  );
  const before = await followUpApplicationService.listFollowUps({
    organizationId: ORG_A,
    authContext: auth(),
    includeLegacy: false
  });
  assert.equal(before.items.length, 0);
  const result = await clientDocumentsApplicationService.createRequestFollowUp(
    request.id,
    { organizationId: ORG_A, dueDate: "2026-09-04", notes: "Check documents" },
    auth()
  );
  assert.equal(result.created, true);
  assert.equal(result.followUp.entityType, "client");
  assert.equal(result.followUp.entityId, CLIENT_ID);
});

test("control-plane empty payload has no tenant documents", () => {
  const empty = emptyDocumentRequests();
  assert.equal(empty.controlPlane, true);
  assert.equal(empty.items.length, 0);
  assert.equal(emptyDocumentDetail().id, null);
});

test("BR-183 routes, migration, storage, and recruiting stay isolated", () => {
  const requestRoutes = fs.readFileSync(path.join(__dirname, "../routes/documentRequests.js"), "utf8");
  const documentRoutes = fs.readFileSync(path.join(__dirname, "../routes/documents.js"), "utf8");
  const service = fs.readFileSync(
    path.join(__dirname, "../application/clientDocumentsApplicationService.js"),
    "utf8"
  );
  const storage = fs.readFileSync(path.join(__dirname, "../infrastructure/clientDocumentStorage.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const clientsPage = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/ClientsPage.jsx"), "utf8");
  const recruitDecision = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"), "utf8");
  const interpreter = fs.readFileSync(path.join(__dirname, "../core/recruitAiV2/interpreter.js"), "utf8");
  const prospectCenter = fs.readFileSync(path.join(__dirname, "../core/prospectCenterReadModel.js"), "utf8");
  const iul = fs.readFileSync(path.join(__dirname, "../core/iulFollowUpWorklistEngine.js"), "utf8");
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/066_br183_client_documents.sql"),
    "utf8"
  );

  assert.match(requestRoutes, /operationalControlPlaneEmpty\(emptyDocumentRequests\)/);
  assert.match(requestRoutes, /organizationGuard\(\)/);
  assert.match(requestRoutes, /getTenantOrganizationId/);
  assert.doesNotMatch(requestRoutes, /req\.body\.phone|fromPhone|tenantPhone/);
  assert.match(documentRoutes, /\/upload/);
  assert.match(documentRoutes, /\/:id\/download/);
  assert.match(server, /app\.use\("\/api\/document-requests", documentRequestsRoutes\)/);
  assert.match(server, /app\.use\("\/api\/documents", documentsRoutes\)/);
  assert.match(storage, /public: false/);
  assert.match(storage, /client-documents/);
  assert.doesNotMatch(storage, /console\.(log|info|error)\([^)]*storageKey/);
  assert.doesNotMatch(service, /OCR|pdf-parse|policy recommendation|replacement analysis/);
  assert.doesNotMatch(service, /loadProductionProspects|\/api\/prospects|recruitAiV2|createProspect/);
  assert.match(clientsPage, /getDocumentRequests\(\{ clientId/);
  assert.match(clientsPage, /documentsSectionTitle/);
  assert.doesNotMatch(recruitDecision, /clientDocumentsApplicationService|atlas_client_documents/);
  assert.doesNotMatch(interpreter, /clientDocumentsApplicationService|atlas_client_documents/);
  assert.doesNotMatch(prospectCenter, /clientDocumentsApplicationService|atlas_client_documents/);
  assert.doesNotMatch(iul, /clientDocumentsApplicationService|atlas_client_documents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS atlas_client_documents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS atlas_client_document_requests/);
  assert.match(migration, /REFERENCES atlas_agenda_clients/);
  assert.match(migration, /REVOKE ALL ON TABLE atlas_client_documents FROM anon, authenticated/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});
