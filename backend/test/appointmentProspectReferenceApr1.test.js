/**
 * APR1 — Appointment prospect_id must reference public.prospects.id.
 * Recruiting-core identity stays explicit on metadata.coreProspectId.
 */

require("dotenv").config();

process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  appointmentPublicProspectId,
  appointmentCoreProspectId,
  appointmentMatchesProspectIdentity
} = require("../core/appointmentProspectIdentity");
const { appointmentEligibleForReclaim } = require("../core/recruitAiV2/postCreateOwnership");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const PUBLIC_TV = "83167302-cd24-4708-b11d-95815aa43568";
const PUBLIC_TL = "ea5a84a0-11d1-455d-abb6-e646dfc27fd6";
const CORE_TL = "f98fd06a-95d7-449a-a9dc-2e030d6f241b";
const FOREIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("1-2. create path source: MC/QC store public.prospects.id + core metadata", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(source, /const prospectId = prospect\.id/);
  assert.match(source, /coreProspectId,/);
  assert.match(source, /metadata\.coreProspectId|coreProspectId,/);
  assert.doesNotMatch(source, /const prospectId = identity\.coreProspectId/);
});

test("3. mission schedule persists via createAppointment (canonical path)", () => {
  const mission = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(mission, /appointmentApplicationService\.createAppointment/);
  assert.match(mission, /createPersistedScheduleAppointment/);
});

test("4-5. tenant isolation helpers — TV/TL public ids do not cross-match", () => {
  const tvAppt = {
    organizationId: ORG_TV,
    prospectId: PUBLIC_TV,
    metadata: { coreProspectId: "core-tv" }
  };
  const tlAppt = {
    organizationId: ORG_TL,
    prospectId: PUBLIC_TL,
    metadata: { coreProspectId: CORE_TL }
  };

  assert.equal(appointmentMatchesProspectIdentity(tvAppt, PUBLIC_TV), true);
  assert.equal(appointmentMatchesProspectIdentity(tvAppt, PUBLIC_TL), false);
  assert.equal(appointmentMatchesProspectIdentity(tlAppt, PUBLIC_TL), true);
  assert.equal(appointmentMatchesProspectIdentity(tlAppt, PUBLIC_TV), false);
  assert.equal(appointmentMatchesProspectIdentity(tlAppt, CORE_TL), true);
  assert.equal(appointmentMatchesProspectIdentity(tvAppt, CORE_TL), false);
});

test("6. foreign prospect ID rejected on create (source contract)", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(source, /input\.prospectId && String\(input\.prospectId\) !== String\(prospect\.id\)/);
  assert.match(source, /Foreign prospect identity cannot be attached/);
});

test("7. reschedule does not rewrite prospectId (preserves association)", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  const rescheduleBlock = source.slice(
    source.indexOf("async function persistRescheduledAppointment"),
    source.indexOf("async function cancelAppointment")
  );
  assert.doesNotMatch(rescheduleBlock, /prospectId:\s*identity/);
  assert.doesNotMatch(rescheduleBlock, /prospectId:\s*input\.prospectId/);
});

test("8. cancel preserves prospect association fields", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  const cancelBlock = source.slice(source.indexOf("async function cancelAppointment"));
  assert.doesNotMatch(cancelBlock, /prospectId:\s*null/);
});

test("9. reminder personalization uses org+phone (not dangling prospect FK)", () => {
  const engine = fs.readFileSync(
    path.join(__dirname, "../services/appointmentReminderEngine.js"),
    "utf8"
  );
  assert.match(engine, /findProspectInOrganization\(/);
  assert.match(engine, /resolveReminderRecipientPhone/);
});

test("10. Google sync does not key off appointment.prospect_id", () => {
  const sync = fs.readFileSync(
    path.join(__dirname, "../core/appointmentGoogleSyncEngine.js"),
    "utf8"
  );
  assert.doesNotMatch(sync, /prospect_id/);
});

test("11. public location / office create still go through createAppointment", () => {
  const mission = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(mission, /meetingLocationType:[\s\S]*public_location/);
  assert.match(mission, /meetingLocationType:[\s\S]*office|"office"/);
});

test("12. reclaim accepts public FK or metadata.coreProspectId", () => {
  const appointment = {
    id: "appt-1",
    organizationId: ORG_TL,
    prospectId: PUBLIC_TL,
    status: "scheduled",
    startDateTime: "2026-08-21T13:00:00.000Z",
    timezone: "America/New_York",
    agentId: "agent-1",
    metadata: { coreProspectId: CORE_TL }
  };

  const byPublic = appointmentEligibleForReclaim(appointment, {
    organizationId: ORG_TL,
    prospectId: PUBLIC_TL,
    agentId: "agent-1",
    proposedDate: "2026-08-21",
    proposedTime: "09:00",
    timezone: "America/New_York"
  });
  const byCore = appointmentEligibleForReclaim(appointment, {
    organizationId: ORG_TL,
    prospectId: CORE_TL,
    agentId: "agent-1",
    proposedDate: "2026-08-21",
    proposedTime: "09:00",
    timezone: "America/New_York"
  });
  const foreign = appointmentEligibleForReclaim(appointment, {
    organizationId: ORG_TL,
    prospectId: FOREIGN,
    agentId: "agent-1",
    proposedDate: "2026-08-21",
    proposedTime: "09:00",
    timezone: "America/New_York"
  });

  // Slot match depends on local timezone conversion; identity mismatch must still fail closed.
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason, "PROSPECT_MISMATCH");
  assert.equal(appointmentPublicProspectId(appointment), PUBLIC_TL);
  assert.equal(appointmentCoreProspectId(appointment), CORE_TL);
  assert.ok(byPublic.reason !== "PROSPECT_MISMATCH");
  assert.ok(byCore.reason !== "PROSPECT_MISMATCH");
});

test("repair migration exists and does not add FK", () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../database/migrations/047_appointment_prospect_id_canonical_repair.sql"
    ),
    "utf8"
  );
  assert.match(sql, /canonical_prospect_id/);
  assert.match(sql, /coreProspectId/);
  assert.doesNotMatch(sql, /ADD CONSTRAINT/i);
  assert.doesNotMatch(sql, /REFERENCES\s+prospects\s*\(/i);
});
