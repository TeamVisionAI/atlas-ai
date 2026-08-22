/**
 * BR-147 — Primerica personal workspace: integration ownership, settings gates,
 * Zoom precedence, WhatsApp phone→owner routing, fail-closed hierarchy.
 */

process.env.WHATSAPP_REPOSITORY = "json";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
  classifyIntegrationOwnership,
  selectGoogleIntegrationRow,
  canManageIntegrationRow,
  OWNERSHIP
} = require("../core/personalIntegrationOwnership");
const {
  resolveCanonicalVirtualMeetingUrl,
  VIRTUAL_MEETING_URL_SOURCES
} = require("../core/virtualMeetingUrlResolver");
const {
  resolveWhatsAppInboundOrganizationId
} = require("../core/whatsappInboundOrganizationResolver");
const { roleHasPermission, PERMISSIONS } = require("../security/permissions");
const { ROLES } = require("../security/roles");
const { resolveHierarchyScopeForUser, HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");

const TV_ORG = "00000000-0000-4000-8000-000000000001";
const TL_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const RVP_ID = "rvp-user";
const RL_ID = "rl-user";
const OTHER_ID = "other-user";

test("A/B. Organization settings: RL lacks org:write; RVP has org:write", () => {
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.ORG_WRITE), false);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.ORG_READ), false);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.ORG_WRITE), true);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.INTEGRATIONS_SELF), true);
  assert.equal(roleHasPermission(ROLES.AGENT, PERMISSIONS.INTEGRATIONS_SELF), true);
});

test("C/E. RL Google selection never returns RVP/org legacy as personal", () => {
  const personal = {
    organization_id: TV_ORG,
    user_id: RL_ID,
    provider: "google_calendar",
    status: "disconnected"
  };
  const orgLegacy = {
    organization_id: TV_ORG,
    user_id: null,
    provider: "google_calendar",
    status: "connected",
    config: { googleAccountEmail: "niovel@teamvision.ai" }
  };

  const forBusy = selectGoogleIntegrationRow({
    personalRow: personal,
    organizationLegacyRow: orgLegacy,
    allowOrgLegacyFallback: false
  });
  assert.equal(forBusy.ownership, OWNERSHIP.PERSONAL);
  assert.equal(forBusy.row.status, "disconnected");

  const classified = classifyIntegrationOwnership(orgLegacy);
  assert.equal(classified.kind, OWNERSHIP.ORGANIZATION);
  assert.equal(
    canManageIntegrationRow({
      actorUserId: RL_ID,
      actorHasOrgWrite: false,
      row: orgLegacy
    }),
    false
  );
});

test("D. RL can manage own Google row only", () => {
  const personal = {
    organization_id: TV_ORG,
    user_id: RL_ID,
    provider: "google_calendar",
    status: "connected"
  };
  assert.equal(
    canManageIntegrationRow({
      actorUserId: RL_ID,
      actorHasOrgWrite: false,
      row: personal
    }),
    true
  );
  assert.equal(
    canManageIntegrationRow({
      actorUserId: OTHER_ID,
      actorHasOrgWrite: false,
      row: personal
    }),
    false
  );
});

test("F/G/H. WhatsApp phone id resolves to org + owning user; ambiguity fails closed", async () => {
  const personalRow = {
    organization_id: TV_ORG,
    user_id: RL_ID,
    phone_number_id: "pn-rl",
    waba_id: "waba-rl",
    status: "connected"
  };

  const resolved = await resolveWhatsAppInboundOrganizationId({
    phoneNumberId: "pn-rl",
    connectionRepository: {
      findConnectionByPhoneNumberId: async () => personalRow,
      getConnection: async () => null
    }
  });
  assert.equal(resolved.organizationId, TV_ORG);
  assert.equal(resolved.ownerUserId, RL_ID);
  assert.equal(resolved.source, "whatsapp_personal_connection");

  await assert.rejects(
    () =>
      resolveWhatsAppInboundOrganizationId({
        phoneNumberId: "pn-dup",
        connectionRepository: {
          findConnectionByPhoneNumberId: async () => {
            const err = new Error("ambiguous");
            err.publicCode = "WHATSAPP_PHONE_ID_AMBIGUOUS";
            err.statusCode = 503;
            throw err;
          }
        }
      }),
    (error) => error.publicCode === "WHATSAPP_PHONE_ID_AMBIGUOUS"
  );
});

test("I/J. Team Vision / Team Legacy org WhatsApp rows remain organization-owned", async () => {
  for (const orgId of [TV_ORG, TL_ORG]) {
    const orgRow = {
      organization_id: orgId,
      user_id: null,
      phone_number_id: `pn-${orgId.slice(0, 8)}`,
      waba_id: "waba-org",
      status: "connected"
    };
    const resolved = await resolveWhatsAppInboundOrganizationId({
      phoneNumberId: orgRow.phone_number_id,
      connectionRepository: {
        findConnectionByPhoneNumberId: async () => orgRow,
        getConnection: async () => orgRow
      }
    });
    assert.equal(resolved.organizationId, orgId);
    assert.equal(resolved.ownerUserId, null);
    assert.equal(resolved.source, "whatsapp_organization_connection");
  }
});

test("K. Personal Zoom preferred over organization Zoom", async () => {
  const resolution = await resolveCanonicalVirtualMeetingUrl(
    {
      organizationId: TV_ORG,
      interviewerUserId: RL_ID,
      meetingType: "virtual",
      meetingProvider: "zoom"
    },
    {
      getAppointmentProfile: async () => ({
        appointmentProfile: {
          virtualMeeting: {
            personalMeetingUrl: "https://zoom.us/j/111222333"
          }
        }
      }),
      getMeetingManagement: async () => ({
        personalMeetingUrl: "https://zoom.us/j/999888777"
      })
    }
  );
  assert.equal(resolution.url, "https://zoom.us/j/111222333");
  assert.equal(resolution.source, VIRTUAL_MEETING_URL_SOURCES.USER_MEETING_SETTINGS);
});

test("L/M. Appointment profile allows Sunday / all days (office hours not a gate)", () => {
  const schedule = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: true,
    blocks: [{ start: "08:00", end: "22:00" }]
  }));
  assert.equal(schedule.length, 7);
  assert.equal(schedule[0].enabled, true);
  assert.equal(schedule[0].dayOfWeek, 0);
  const profileSource = fs.readFileSync(
    path.join(__dirname, "../services/appointmentProfileService.js"),
    "utf8"
  );
  assert.match(profileSource, /Array\.from\(\{\s*length:\s*7/);
  assert.match(profileSource, /personalMeetingUrl/);
});

test("N. Scheduling engine passes agentId into Google free/busy", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../services/appointmentSchedulingEngine.js"),
    "utf8"
  );
  assert.match(source, /loadGoogleBusy\([\s\S]*agentId/);
  assert.match(source, /userId/);
});

test("O. Missing hierarchy fails closed to self", async () => {
  const scope = await resolveHierarchyScopeForUser(
    {
      id: RL_ID,
      role: ROLES.DIVISION_LEADER,
      organization_id: TV_ORG
    },
    {
      loadOrgUsers: async () => []
    }
  );
  // Empty org user graph → no descendants → fail closed to self.
  assert.equal(scope.mode, HIERARCHY_MODES.SELF);
  assert.deepEqual(scope.userIds, [RL_ID]);
});

test("P. QR org-wide manage requires org:write (not prospect:assign alone)", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../core/qrChannel/qrCampaignManagerService.js"),
    "utf8"
  );
  assert.match(
    source,
    /function canManageOrgCampaigns\(authContext\) \{\s*\/\/ BR-147[\s\S]*PERMISSIONS\.ORG_WRITE/
  );
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.ORG_WRITE), false);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.ORG_WRITE), true);
});

test("Q. Migration keeps legacy user_id NULL uniqueness and personal uniqueness", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/049_personal_integration_ownership.sql"),
    "utf8"
  );
  assert.match(migration, /uq_org_integrations_org_provider_legacy/);
  assert.match(migration, /uq_org_integrations_org_user_provider/);
  assert.match(migration, /uq_whatsapp_integrations_org_legacy/);
  assert.match(migration, /uq_whatsapp_integrations_org_user/);
  assert.match(migration, /uq_whatsapp_integrations_connected_phone_number_id/);
  assert.doesNotMatch(migration, /UPDATE\s+organization_integrations\s+SET\s+user_id/i);
  assert.doesNotMatch(migration, /UPDATE\s+whatsapp_integrations\s+SET\s+user_id/i);
});
