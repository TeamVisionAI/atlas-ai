/**
 * BR-120 — Canonical prospect identity bridge (legacy ↔ core).
 * Guards the Anthony incident dual-UUID split without mass-rewriting durable rows.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveCanonicalProspectIdentity,
  rememberProspectMapping,
  clearProspectBridgeCacheForTests,
  normalizeStoragePhone
} = require("../core/recruitingProspectBridge");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "+17867527481";
const LEGACY_ID = "83167302-cd24-4708-b11d-95815aa43568";
const CORE_ID = "a257b152-43ea-401f-8de3-783b997013ff";

test("BR-120 resolver returns core + legacy for Anthony-like phone", async () => {
  clearProspectBridgeCacheForTests();
  rememberProspectMapping(PHONE, CORE_ID);

  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG,
    legacyProspectId: LEGACY_ID,
    ensureCore: false,
    findLegacyByPhone: async () => ({ id: LEGACY_ID, phone: PHONE })
  });

  assert.equal(identity.phone, normalizeStoragePhone(PHONE));
  assert.equal(identity.coreProspectId, CORE_ID);
  assert.equal(identity.legacyProspectId, LEGACY_ID);
  assert.deepEqual(identity.identityIds.sort(), [CORE_ID, LEGACY_ID].sort());
});

test("BR-120 durable load finds legacy-keyed active when caller supplies core + phone", async () => {
  clearProspectBridgeCacheForTests();
  rememberProspectMapping(PHONE, CORE_ID);

  const repository = createMemoryContextRepository([
    {
      id: "2daecf35-0ac3-45fd-97aa-eba055aef663",
      organization_id: ORG,
      prospect_id: LEGACY_ID,
      channel: "whatsapp",
      context_json: createConversationContext({
        organizationId: ORG,
        prospectId: LEGACY_ID,
        currentStage: "scheduling"
      }),
      context_version: 3,
      schema_version: 1,
      conversation_version: 1,
      archived_at: null,
      source: "v2"
    }
  ]);

  const persistence = createContextPersistenceService({
    repository,
    resolveIdentity: async () => ({
      phone: PHONE,
      organizationId: ORG,
      coreProspectId: CORE_ID,
      legacyProspectId: LEGACY_ID,
      coreCreated: false,
      coreSkipped: false,
      identityIds: [CORE_ID, LEGACY_ID]
    })
  });

  const loaded = await persistence.loadContext({
    organizationId: ORG,
    prospectId: CORE_ID,
    channel: "whatsapp",
    prospectPhone: PHONE,
    legacyProspectId: LEGACY_ID,
    ensureCore: false
  });

  assert.ok(loaded);
  assert.equal(loaded._persistence.id, "2daecf35-0ac3-45fd-97aa-eba055aef663");
  assert.equal(loaded._persistence.rowProspectId, LEGACY_ID);
  // In-memory JSON truth prefers core without mutating row prospect_id.
  assert.equal(loaded.prospectId, CORE_ID);
});

test("BR-120 save keeps legacy-keyed row; does not create a second active", async () => {
  clearProspectBridgeCacheForTests();

  const repository = createMemoryContextRepository([
    {
      id: "legacy-row-1",
      organization_id: ORG,
      prospect_id: LEGACY_ID,
      channel: "whatsapp",
      context_json: createConversationContext({
        organizationId: ORG,
        prospectId: LEGACY_ID
      }),
      context_version: 1,
      schema_version: 1,
      conversation_version: 1,
      archived_at: null,
      source: "v2"
    }
  ]);

  const persistence = createContextPersistenceService({
    repository,
    resolveIdentity: async () => ({
      phone: PHONE,
      organizationId: ORG,
      coreProspectId: CORE_ID,
      legacyProspectId: LEGACY_ID,
      coreCreated: false,
      coreSkipped: false,
      identityIds: [CORE_ID, LEGACY_ID]
    })
  });

  const saved = await persistence.compareAndSaveContext({
    organizationId: ORG,
    prospectId: CORE_ID,
    channel: "whatsapp",
    expectedVersion: 1,
    nextContext: createConversationContext({
      organizationId: ORG,
      prospectId: CORE_ID,
      currentStage: "proposed"
    }),
    prospectPhone: PHONE,
    legacyProspectId: LEGACY_ID,
    ensureCore: false
  });

  assert.equal(saved.ok, true);
  assert.equal(saved.context._persistence.id, "legacy-row-1");
  assert.equal(saved.context._persistence.rowProspectId, LEGACY_ID);
  assert.equal(saved.context.prospectId, CORE_ID);
  assert.equal(saved.context.currentStage, "proposed");

  const actives = repository._all().filter((row) => !row.archived_at);
  assert.equal(actives.length, 1);
  assert.equal(actives[0].prospect_id, LEGACY_ID);
});

test("BR-120 new durable create uses core prospect_id", async () => {
  clearProspectBridgeCacheForTests();

  const repository = createMemoryContextRepository();
  const persistence = createContextPersistenceService({
    repository,
    resolveIdentity: async () => ({
      phone: PHONE,
      organizationId: ORG,
      coreProspectId: CORE_ID,
      legacyProspectId: LEGACY_ID,
      coreCreated: false,
      coreSkipped: false,
      identityIds: [CORE_ID, LEGACY_ID]
    })
  });

  const created = await persistence.createContext({
    organizationId: ORG,
    prospectId: LEGACY_ID,
    channel: "whatsapp",
    prospectPhone: PHONE,
    legacyProspectId: LEGACY_ID,
    ensureCore: false
  });

  assert.equal(created.prospectId, CORE_ID);
  assert.equal(created._persistence.rowProspectId, CORE_ID);
  const rows = repository._all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prospect_id, CORE_ID);
});

test("BR-120 appointment path helper never chooses legacy as core id", async () => {
  clearProspectBridgeCacheForTests();
  rememberProspectMapping(PHONE, CORE_ID);

  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG,
    legacyProspectId: LEGACY_ID,
    ensureCore: false,
    findLegacyByPhone: async () => ({ id: LEGACY_ID })
  });

  // Appointment FK must use core — never the WhatsApp legacy UUID.
  assert.equal(identity.coreProspectId, CORE_ID);
  assert.notEqual(identity.coreProspectId, identity.legacyProspectId);
});
