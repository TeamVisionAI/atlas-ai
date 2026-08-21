/**
 * BR-120 — Canonical prospect identity bridge (legacy ↔ core).
 * Org-scoped resolution, (org+phone) cache, fail-closed mismatch/ambiguity,
 * and appointment create must never persist prospect_id=null.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveCanonicalProspectIdentity,
  rememberProspectMapping,
  clearProspectBridgeCacheForTests,
  normalizeStoragePhone,
  findCoreProspectIdByPhone,
  REASON_CODES,
  buildCacheKey
} = require("../core/recruitingProspectBridge");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");

const ORG_A = "00000000-0000-4000-8000-000000000001"; // Team Vision
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "+17867527481";
const LEGACY_ID = "83167302-cd24-4708-b11d-95815aa43568";
const CORE_A = "a257b152-43ea-401f-8de3-783b997013ff";
const CORE_A2 = "b1111111-1111-4111-8111-111111111111";
const CORE_B = "c2222222-2222-4222-8222-222222222222";

function anthonyInOrgA() {
  return [
    {
      prospectId: CORE_A,
      id: CORE_A,
      organizationId: ORG_A,
      organization_id: ORG_A
    }
  ];
}

test("G1: same phone, Org A core exists → Org A resolves it", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_A,
    legacyProspectId: LEGACY_ID,
    ensureCore: false,
    listInOrg: async () => anthonyInOrgA(),
    listAnyOrg: async () => anthonyInOrgA(),
    findLegacyByPhone: async () => ({ id: LEGACY_ID, phone: PHONE })
  });
  assert.equal(identity.ok, true);
  assert.equal(identity.coreProspectId, CORE_A);
  assert.equal(identity.organizationId, ORG_A);
});

test("G2: same phone from Org B → Org A core is NOT returned", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_B,
    ensureCore: false,
    listInOrg: async () => [],
    listAnyOrg: async () => anthonyInOrgA(),
    findLegacyByPhone: async () => null
  });
  assert.equal(identity.ok, false);
  assert.equal(identity.reasonCode, REASON_CODES.ORG_MISMATCH);
  assert.equal(identity.coreProspectId, null);
});

test("G3: Org A cache populated → Org B still cannot receive Org A mapping", async () => {
  clearProspectBridgeCacheForTests();
  rememberProspectMapping(PHONE, CORE_A, ORG_A);

  const fromB = await findCoreProspectIdByPhone(PHONE, ORG_B, {
    listInOrg: async () => []
  });
  assert.equal(fromB, null);

  const identityB = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_B,
    ensureCore: false,
    listInOrg: async () => [],
    listAnyOrg: async () => anthonyInOrgA()
  });
  assert.equal(identityB.ok, false);
  assert.equal(identityB.reasonCode, REASON_CODES.ORG_MISMATCH);
  assert.equal(identityB.coreProspectId, null);

  const fromA = await findCoreProspectIdByPhone(PHONE, ORG_A, {
    listInOrg: async () => anthonyInOrgA()
  });
  assert.equal(fromA, CORE_A);
  assert.equal(buildCacheKey(ORG_A, PHONE).includes(ORG_A), true);
  assert.notEqual(buildCacheKey(ORG_A, PHONE), buildCacheKey(ORG_B, PHONE));
});

test("G4: explicit organization mismatch → fail closed", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_B,
    ensureCore: false,
    listInOrg: async () => [],
    listAnyOrg: async () => [
      { prospectId: CORE_A, organizationId: ORG_A, organization_id: ORG_A }
    ]
  });
  assert.equal(identity.ok, false);
  assert.equal(identity.reasonCode, REASON_CODES.ORG_MISMATCH);
});

test("G5: multiple candidate core identities → fail closed", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_A,
    ensureCore: false,
    listInOrg: async () => [
      { prospectId: CORE_A, organizationId: ORG_A },
      { prospectId: CORE_A2, organizationId: ORG_A }
    ],
    listAnyOrg: async () => []
  });
  assert.equal(identity.ok, false);
  assert.equal(identity.reasonCode, REASON_CODES.AMBIGUOUS);
  assert.equal(identity.coreProspectId, null);
});

test("G6: no core + ensureCore=false → unresolved, no guessing", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_A,
    ensureCore: false,
    listInOrg: async () => [],
    listAnyOrg: async () => [],
    findLegacyByPhone: async () => ({ id: LEGACY_ID })
  });
  assert.equal(identity.ok, false);
  assert.equal(identity.reasonCode, REASON_CODES.UNRESOLVED);
  assert.equal(identity.coreProspectId, null);
});

test("G7: no core + ensureCore=true → creates/ensures core in requested org", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: "+15551234567",
    organizationId: ORG_A,
    ensureCore: true,
    listInOrg: async () => [],
    listAnyOrg: async () => [],
    findLegacyByPhone: async () => null,
    ensureCoreFn: async ({ organizationId }) => ({
      ok: true,
      prospectId: CORE_B,
      created: true,
      organizationId,
      reasonCode: null
    })
  });
  assert.equal(identity.ok, true);
  assert.equal(identity.coreProspectId, CORE_B);
  assert.equal(identity.organizationId, ORG_A);
  assert.equal(identity.coreCreated, true);
});

test("G7b: ensureCore when existing unique in-org core reuses it", async () => {
  clearProspectBridgeCacheForTests();
  rememberProspectMapping("+15559876543", CORE_B, ORG_A);
  const identity = await resolveCanonicalProspectIdentity({
    phone: "+15559876543",
    organizationId: ORG_A,
    ensureCore: true,
    listInOrg: async () => [{ prospectId: CORE_B, organizationId: ORG_A }],
    listAnyOrg: async () => [{ prospectId: CORE_B, organizationId: ORG_A }],
    findLegacyByPhone: async () => null
  });
  assert.equal(identity.ok, true);
  assert.equal(identity.coreProspectId, CORE_B);
  assert.equal(identity.organizationId, ORG_A);
});

test("G8/G9: appointment create requires identity — stores public.prospects.id not core", async () => {
  clearProspectBridgeCacheForTests();
  // Source contract: createAppointment resolves identity before scheduleAppointment.
  // APR1 — persist prospect_id = public.prospects.id; core only in metadata.coreProspectId.
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  const resolveIdx = source.indexOf("resolveCanonicalProspectIdentity");
  const scheduleIdx = source.indexOf("await scheduleAppointment({");
  const persistIdx = source.indexOf("appointmentDomainService.scheduleAppointment");
  assert.ok(resolveIdx > 0);
  assert.ok(scheduleIdx > resolveIdx, "identity resolve must precede Calendar scheduleAppointment");
  assert.ok(persistIdx > resolveIdx, "identity resolve must precede appointment domain persist");
  assert.match(
    source,
    /identity\.ok \|\| !identity\.coreProspectId[\s\S]*buildError\([\s\S]*PROSPECT_IDENTITY/
  );
  assert.match(source, /Never persist atlas_appointments\.prospect_id = null/);
  assert.match(source, /const prospectId = prospect\.id/);
  assert.match(source, /coreProspectId/);
  assert.match(source, /Foreign prospect identity cannot be attached/);
  assert.doesNotMatch(
    source,
    /const prospectId = identity\.coreProspectId/
  );
});

test("G10: legacy durable row dual-load still works", async () => {
  clearProspectBridgeCacheForTests();
  const repository = createMemoryContextRepository([
    {
      id: "2daecf35-0ac3-45fd-97aa-eba055aef663",
      organization_id: ORG_A,
      prospect_id: LEGACY_ID,
      channel: "whatsapp",
      context_json: createConversationContext({
        organizationId: ORG_A,
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
      ok: true,
      reasonCode: null,
      phone: PHONE,
      organizationId: ORG_A,
      coreProspectId: CORE_A,
      legacyProspectId: LEGACY_ID,
      coreCreated: false,
      coreSkipped: false,
      identityIds: [CORE_A, LEGACY_ID]
    })
  });

  const loaded = await persistence.loadContext({
    organizationId: ORG_A,
    prospectId: CORE_A,
    channel: "whatsapp",
    prospectPhone: PHONE,
    legacyProspectId: LEGACY_ID,
    ensureCore: false
  });

  assert.ok(loaded);
  assert.equal(loaded._persistence.id, "2daecf35-0ac3-45fd-97aa-eba055aef663");
  assert.equal(loaded._persistence.rowProspectId, LEGACY_ID);
  assert.equal(loaded.prospectId, CORE_A);
});

test("G11: legacy-loaded save does not create duplicate active context", async () => {
  clearProspectBridgeCacheForTests();
  const repository = createMemoryContextRepository([
    {
      id: "legacy-row-1",
      organization_id: ORG_A,
      prospect_id: LEGACY_ID,
      channel: "whatsapp",
      context_json: createConversationContext({
        organizationId: ORG_A,
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
      ok: true,
      reasonCode: null,
      phone: PHONE,
      organizationId: ORG_A,
      coreProspectId: CORE_A,
      legacyProspectId: LEGACY_ID,
      coreCreated: false,
      coreSkipped: false,
      identityIds: [CORE_A, LEGACY_ID]
    })
  });

  const saved = await persistence.compareAndSaveContext({
    organizationId: ORG_A,
    prospectId: CORE_A,
    channel: "whatsapp",
    expectedVersion: 1,
    nextContext: createConversationContext({
      organizationId: ORG_A,
      prospectId: CORE_A,
      currentStage: "proposed"
    }),
    prospectPhone: PHONE,
    legacyProspectId: LEGACY_ID,
    ensureCore: false
  });

  assert.equal(saved.ok, true);
  assert.equal(saved.context._persistence.id, "legacy-row-1");
  assert.equal(saved.context._persistence.rowProspectId, LEGACY_ID);
  assert.equal(repository._all().filter((r) => !r.archived_at).length, 1);
});

test("G12: new durable context keys to core UUID", async () => {
  clearProspectBridgeCacheForTests();
  const repository = createMemoryContextRepository();
  const persistence = createContextPersistenceService({
    repository,
    resolveIdentity: async () => ({
      ok: true,
      reasonCode: null,
      phone: PHONE,
      organizationId: ORG_A,
      coreProspectId: CORE_A,
      legacyProspectId: LEGACY_ID,
      coreCreated: false,
      coreSkipped: false,
      identityIds: [CORE_A, LEGACY_ID]
    })
  });

  const created = await persistence.createContext({
    organizationId: ORG_A,
    prospectId: LEGACY_ID,
    channel: "whatsapp",
    prospectPhone: PHONE,
    legacyProspectId: LEGACY_ID,
    ensureCore: false
  });

  assert.equal(created.prospectId, CORE_A);
  assert.equal(created._persistence.rowProspectId, CORE_A);
  assert.equal(repository._all()[0].prospect_id, CORE_A);
});

test("G13: Anthony mapping remains deterministic for Team Vision", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_A,
    legacyProspectId: LEGACY_ID,
    ensureCore: false,
    listInOrg: async () => anthonyInOrgA(),
    listAnyOrg: async () => anthonyInOrgA(),
    findLegacyByPhone: async () => ({ id: LEGACY_ID, phone: PHONE })
  });

  assert.equal(identity.ok, true);
  assert.equal(identity.phone, normalizeStoragePhone(PHONE));
  assert.equal(identity.legacyProspectId, LEGACY_ID);
  assert.equal(identity.coreProspectId, CORE_A);
  assert.equal(identity.organizationId, ORG_A);
});

test("G14 / conflict: conflicting legacy→core mapping fails closed", async () => {
  clearProspectBridgeCacheForTests();
  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_A,
    legacyProspectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ensureCore: false,
    listInOrg: async () => anthonyInOrgA(),
    listAnyOrg: async () => anthonyInOrgA(),
    findLegacyByPhone: async () => ({ id: LEGACY_ID })
  });
  assert.equal(identity.ok, false);
  assert.equal(identity.reasonCode, REASON_CODES.CONFLICT);
});

test("durable persistence throws on hard identity fail-closed codes", async () => {
  clearProspectBridgeCacheForTests();
  const persistence = createContextPersistenceService({
    repository: createMemoryContextRepository(),
    resolveIdentity: async () => ({
      ok: false,
      reasonCode: REASON_CODES.ORG_MISMATCH,
      phone: PHONE,
      organizationId: ORG_B,
      coreProspectId: null,
      legacyProspectId: null,
      identityIds: []
    })
  });

  await assert.rejects(
    () =>
      persistence.loadContext({
        organizationId: ORG_B,
        prospectId: CORE_A,
        prospectPhone: PHONE,
        ensureCore: false
      }),
    (error) => error.code === REASON_CODES.ORG_MISMATCH
  );
});
