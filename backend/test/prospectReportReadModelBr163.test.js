/**
 * BR-163 — tenant-scoped printable prospect report isolation.
 */

require("dotenv").config({ quiet: true });
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const {
  buildProspectReport,
  matchesReportFilters,
  toCsv,
  emptyControlPlane
} = require("../core/prospectReportReadModel");

const ORG_TV = "00000000-0000-4000-8000-000000000001";
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

function auth(organizationId, saasRole = SAAS_ROLES.ADMIN) {
  return {
    userId: "user-1",
    organizationId,
    role: ROLES.ADMINISTRATOR,
    saasRole,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
}

test("super admin without Support Mode gets an empty control-plane report", async () => {
  const report = await buildProspectReport({
    organizationId: ORG_TV,
    authContext: auth(ORG_TV, SAAS_ROLES.SUPER_ADMIN),
    supportModeActive: false,
    appointments: { items: [] },
    prospects: [
      {
        id: "tv-1",
        phone: "+17865551001",
        name: "Vision",
        organization_id: ORG_TV,
        current_step: "QUALIFICATION"
      }
    ]
  });
  assert.equal(report.emptyReason, "SUPER_ADMIN_CONTROL_PLANE");
  assert.equal(report.items.length, 0);
  assert.equal(emptyControlPlane(ORG_TV).items.length, 0);
});

test("report never includes another tenant's prospects", async () => {
  const report = await buildProspectReport({
    organizationId: ORG_TL,
    authContext: auth(ORG_TL),
    supportModeActive: false,
    appointments: { items: [] },
    prospects: [
      {
        id: "tv-1",
        phone: "+17865551001",
        name: "Vision",
        organization_id: ORG_TV,
        current_step: "QUALIFICATION"
      },
      {
        id: "tl-1",
        phone: "+17865553001",
        name: "Legacy",
        organization_id: ORG_TL,
        current_step: "QUALIFICATION"
      }
    ]
  });
  assert.equal(report.items.every((row) => row.phone === "+17865553001" || row.name === "Legacy"), true);
  assert.equal(report.items.some((row) => row.phone === "+17865551001"), false);
});

test("missing organizationId fails closed", async () => {
  await assert.rejects(
    () => buildProspectReport({ organizationId: "", authContext: auth(ORG_TV) }),
    /organizationId is required/
  );
});

test("CSV uses the same report columns", () => {
  const csv = toCsv([
    {
      prospectId: "TV-000001",
      name: "Ana",
      phone: "+17865550000",
      status: "QUALIFICATION",
      owner: "Ana Perez",
      source: "whatsapp",
      city: "Miami",
      state: "FL",
      language: "es",
      appointmentStatus: "scheduled",
      appointmentAt: "2026-08-28T15:00:00.000Z",
      lastActivityAt: "2026-08-27T12:00:00.000Z"
    }
  ]);
  assert.match(csv, /Prospect ID,Name,Phone,Status,Owner/);
  assert.match(csv, /TV-000001/);
  assert.doesNotMatch(csv, /password|token|credential/i);
});

test("support mode Super Admin can read the selected tenant only", async () => {
  const report = await buildProspectReport({
    organizationId: ORG_TV,
    authContext: auth(ORG_TV, SAAS_ROLES.SUPER_ADMIN),
    supportModeActive: true,
    appointments: { items: [] },
    ownerNames: new Map(),
    prospects: [
      {
        id: "tv-1",
        phone: "+17865551001",
        name: "Vision",
        organization_id: ORG_TV,
        current_step: "QUALIFICATION"
      },
      {
        id: "tl-1",
        phone: "+17865553001",
        name: "Legacy",
        organization_id: ORG_TL,
        current_step: "QUALIFICATION"
      }
    ]
  });
  assert.equal(report.emptyReason, null);
  assert.equal(report.items.some((row) => row.phone === "+17865551001"), true);
  assert.equal(report.items.some((row) => row.phone === "+17865553001"), false);
});

test("recruiter hierarchy sees only owned prospects", async () => {
  const report = await buildProspectReport({
    organizationId: ORG_TV,
    authContext: {
      userId: "owner-a",
      organizationId: ORG_TV,
      role: ROLES.RECRUITER,
      saasRole: SAAS_ROLES.USER,
      permissions: permissionsForRole(ROLES.RECRUITER),
      status: "active"
    },
    appointments: { items: [] },
    ownerNames: new Map(),
    prospects: [
      {
        id: "owned",
        phone: "+17865551011",
        name: "Mine",
        organization_id: ORG_TV,
        owner_user_id: "owner-a",
        current_step: "QUALIFICATION"
      },
      {
        id: "other",
        phone: "+17865551012",
        name: "Theirs",
        organization_id: ORG_TV,
        owner_user_id: "owner-b",
        current_step: "QUALIFICATION"
      }
    ]
  });
  assert.equal(report.items.length, 1);
  assert.equal(report.items[0].phone, "+17865551011");
});

test("archived lifecycle filter excludes active prospects", () => {
  assert.equal(
    matchesReportFilters({ archived: false, lastActivityAt: "2026-08-27T00:00:00.000Z" }, { lifecycle: "archived" }),
    false
  );
  assert.equal(
    matchesReportFilters({ archived: true, lastActivityAt: "2026-08-27T00:00:00.000Z" }, { lifecycle: "archived" }),
    true
  );
});
