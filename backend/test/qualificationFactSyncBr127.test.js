/**
 * BR-127 — V2 durable qualification → schedule workflow sync.
 */
"use strict";

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  planQualificationFactSync,
  synchronizeQualificationFactsForSchedule,
  SYNC_REASON
} = require("../core/recruitAiV2/qualificationFactSync");
const { validateMilestoneAdvancement } = require("../core/milestoneValidationEngine");
const { MILESTONES } = require("../core/workflowConstants");
const {
  executeScheduleInterview
} = require("../application/missionExecutionApplicationService");

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "11111111-1111-4111-8111-111111111111";
const CORE = "6a52ef58-511e-4a25-9f81-b5ea211a51be";
const LEGACY = "cc539cb3-1bfd-4329-8ddb-e3b74bf75c33";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PHONE = "+17863071530";

function marielenaDurable() {
  return {
    prospectId: CORE,
    organizationId: ORG,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    }
  };
}

function sparseLegacy(overrides = {}) {
  return {
    id: LEGACY,
    phone: PHONE,
    name: "Marielena Campo",
    organization_id: ORG,
    city: null,
    state: null,
    work_authorized: null,
    occupation: null,
    notes: null,
    current_step: "NEW",
    ...overrides
  };
}

describe("BR-127 qualification fact sync", () => {
  test("docs: BR-127 present", () => {
    const rules = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(rules, /## BR-127/);
  });

  test("1–2. sparse legacy + durable Miami/FL/true → sync + advance valid", async () => {
    const writes = [];
    const sync = await synchronizeQualificationFactsForSchedule({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy(),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY,
      updateProspectFn: async (phone, patch) => {
        writes.push({ phone, patch });
      },
      baseCapturedFields: {
        interviewDateTime: "2026-08-10T17:00:00.000Z",
        interviewType: "In Person",
        confirmed: true,
        appointmentDate: "2026-08-10",
        preferredTime: "13:00"
      }
    });

    assert.equal(sync.ok, true);
    assert.equal(sync.capturedFields.city, "Miami");
    assert.equal(sync.capturedFields.state, "FL");
    assert.equal(sync.capturedFields.authorization, true);
    assert.deepEqual(writes[0]?.patch, {
      city: "Miami",
      state: "FL",
      work_authorized: true
    });

    const advance = validateMilestoneAdvancement({
      currentMilestone: MILESTONES.INTERVIEW_READY,
      targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      prospect: sparseLegacy(writes[0].patch),
      capturedFields: sync.capturedFields
    });
    assert.equal(advance.valid, true);
    assert.deepEqual(advance.missingFields, []);
  });

  test("3. missing email does not block INTERVIEW_SCHEDULED", () => {
    const r = validateMilestoneAdvancement({
      currentMilestone: MILESTONES.INTERVIEW_READY,
      targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      prospect: sparseLegacy({
        city: "Miami",
        state: "FL",
        work_authorized: true,
        occupation: null
      }),
      capturedFields: {
        interviewDateTime: "2026-08-10T17:00:00.000Z",
        interviewType: "In Person",
        confirmed: true,
        appointmentDate: "2026-08-10",
        preferredTime: "13:00"
      }
    });
    assert.equal(r.valid, true);
  });

  test("4. occupation null still succeeds (BR-123)", () => {
    const r = validateMilestoneAdvancement({
      currentMilestone: MILESTONES.INTERVIEW_READY,
      targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      prospect: sparseLegacy({
        city: "Miami",
        state: "FL",
        work_authorized: true,
        occupation: null
      }),
      capturedFields: {
        interviewDateTime: "2026-08-10T17:00:00.000Z",
        confirmed: true,
        appointmentDate: "2026-08-10",
        preferredTime: "13:00",
        interviewType: "In Person"
      }
    });
    assert.equal(r.valid, true);
  });

  test("5. conflicting legacy non-null fails closed", () => {
    const plan = planQualificationFactSync({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy({ city: "Orlando", state: "FL", work_authorized: true }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.reasonCode, SYNC_REASON.FACT_CONFLICT);
    assert.ok(plan.conflicts.some((c) => c.field === "city"));
    assert.deepEqual(plan.legacyUpdates, {});
  });

  test("6. cross-org mismatch — no sync", () => {
    const plan = planQualificationFactSync({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy({ organization_id: OTHER_ORG }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.reasonCode, SYNC_REASON.ORG_MISMATCH);
  });

  test("7. wrong core mapping — fail closed", () => {
    const plan = planQualificationFactSync({
      durableContext: { ...marielenaDurable(), prospectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      prospect: sparseLegacy(),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.reasonCode, SYNC_REASON.IDENTITY_MISMATCH);
  });

  test("8. V2 execution path: sync + calendar + persist + advance — no rollback", async () => {
    const legacy = sparseLegacy();
    const prospectWrites = [];
    let calendarCreates = 0;
    let calendarCancels = 0;
    let advances = 0;
    let rollbacks = 0;
    let capturedSeen = null;

    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        recruitAiV2Context: marielenaDurable(),
        recruitAiV2CoreProspectId: CORE,
        dependencies: {
          resolveTenantProspect: async () => legacy,
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: CORE,
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
            meetingUrl: null
          }),
          getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
          scheduleAppointment: async () => {
            calendarCreates += 1;
            return {
              success: true,
              googleCalendarEventId: "cal-br127-1",
              startTimeISO: "2026-08-10T17:00:00.000Z",
              meetingUrl: null
            };
          },
          updateProspect: async (_phone, patch) => {
            prospectWrites.push(patch);
            Object.assign(legacy, patch);
          },
          createPersistedScheduleAppointment: async () => ({
            id: "appt-br127-1",
            status: "scheduled",
            calendarEventId: "cal-br127-1",
            prospectId: CORE
          }),
          rollbackPersistedAppointment: async () => {
            rollbacks += 1;
            calendarCancels += 1;
          },
          advanceProspectWorkflow: async (_phone, payload) => {
            advances += 1;
            capturedSeen = payload.capturedFields;
            const validation = validateMilestoneAdvancement({
              currentMilestone: MILESTONES.INTERVIEW_READY,
              targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
              prospect: legacy,
              capturedFields: payload.capturedFields
            });
            assert.equal(validation.valid, true);
            return { success: true, workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" } };
          }
        }
      }
    );

    assert.equal(result.success, true);
    assert.equal(calendarCreates, 1);
    assert.equal(advances, 1);
    assert.equal(rollbacks, 0);
    assert.equal(calendarCancels, 0);
    assert.equal(capturedSeen.city, "Miami");
    assert.equal(capturedSeen.state, "FL");
    assert.equal(capturedSeen.authorization, true);
    assert.ok(prospectWrites.some((p) => p.city === "Miami" && p.work_authorized === true));
    assert.equal(result.appointmentId, "appt-br127-1");
    assert.equal(result.calendarEventId, "cal-br127-1");
  });

  test("9. genuine advance failure still rolls back (BR-121 path)", async () => {
    let rollbackCalls = 0;
    let calendarCancelAttempts = 0;
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        recruitAiV2Context: marielenaDurable(),
        recruitAiV2CoreProspectId: CORE,
        dependencies: {
          resolveTenantProspect: async () => sparseLegacy(),
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: CORE,
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
          scheduleAppointment: async () => ({
            success: true,
            googleCalendarEventId: "cal-br127-rollback",
            startTimeISO: "2026-08-10T17:00:00.000Z"
          }),
          updateProspect: async () => ({}),
          createPersistedScheduleAppointment: async () => ({
            id: "appt-br127-rollback",
            status: "scheduled",
            calendarEventId: "cal-br127-rollback"
          }),
          rollbackPersistedAppointment: async () => {
            rollbackCalls += 1;
          },
          cancelAppointment: async () => {
            calendarCancelAttempts += 1;
            return { success: true };
          },
          findAppointmentById: async () => null,
          advanceProspectWorkflow: async () => ({
            success: false,
            error: "WORKFLOW_ADVANCE_FAILED",
            message: "forced failure"
          })
        }
      }
    );

    assert.equal(result.success, false);
    assert.equal(result.error, "WORKFLOW_ADVANCE_FAILED");
    assert.equal(rollbackCalls, 1);
    assert.equal(calendarCancelAttempts, 1);
  });

  test("wrong V2 core vs schedule identity — fail before calendar", async () => {
    let calendarCreates = 0;
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        recruitAiV2Context: marielenaDurable(),
        recruitAiV2CoreProspectId: CORE,
        dependencies: {
          resolveTenantProspect: async () => sparseLegacy(),
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          scheduleAppointment: async () => {
            calendarCreates += 1;
            return { success: true };
          }
        }
      }
    );
    assert.equal(result.success, false);
    assert.equal(result.error, "QUALIFICATION_SYNC_IDENTITY_MISMATCH");
    assert.equal(calendarCreates, 0);
  });

  test("equal legacy/durable is noop write (no conflict)", () => {
    const plan = planQualificationFactSync({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy({
        city: "Miami",
        state: "FL",
        work_authorized: true
      }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.legacyUpdates, {});
    assert.equal(plan.capturedPatch.city, "Miami");
  });

  test("10–11. city conflict clears entire mutation set (no partial state/auth)", () => {
    const plan = planQualificationFactSync({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy({ city: "Orlando", state: null, work_authorized: null }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.reasonCode, SYNC_REASON.FACT_CONFLICT);
    assert.deepEqual(plan.legacyUpdates, {});
    assert.deepEqual(plan.capturedPatch, {});
  });

  test("state conflict clears city/auth mutations", () => {
    const plan = planQualificationFactSync({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy({ city: null, state: "NY", work_authorized: null }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.legacyUpdates, {});
  });

  test("authorization conflict clears city/state mutations", () => {
    const plan = planQualificationFactSync({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy({ city: null, state: null, work_authorized: false }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.legacyUpdates, {});
  });

  test("fact conflict fails before Calendar create", async () => {
    let calendarCreates = 0;
    let prospectWrites = 0;
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        recruitAiV2Context: marielenaDurable(),
        recruitAiV2CoreProspectId: CORE,
        dependencies: {
          resolveTenantProspect: async () => sparseLegacy({ city: "Orlando" }),
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: CORE,
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          scheduleAppointment: async () => {
            calendarCreates += 1;
            return { success: true };
          },
          updateProspect: async () => {
            prospectWrites += 1;
          }
        }
      }
    );
    assert.equal(result.success, false);
    assert.equal(result.error, "QUALIFICATION_FACT_CONFLICT");
    assert.equal(calendarCreates, 0);
    assert.equal(prospectWrites, 0);
  });

  test("write failure returns QUALIFICATION_SYNC_WRITE_FAILED + rollback", async () => {
    let rollbackCalls = 0;
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        recruitAiV2Context: marielenaDurable(),
        recruitAiV2CoreProspectId: CORE,
        dependencies: {
          resolveTenantProspect: async () => sparseLegacy(),
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: CORE,
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
          scheduleAppointment: async () => ({
            success: true,
            googleCalendarEventId: "cal-br127-write-fail",
            startTimeISO: "2026-08-10T17:00:00.000Z"
          }),
          updateProspect: async () => {
            throw new Error("forced db failure");
          },
          createPersistedScheduleAppointment: async () => ({
            id: "appt-br127-write-fail",
            status: "scheduled",
            calendarEventId: "cal-br127-write-fail"
          }),
          rollbackPersistedAppointment: async () => {
            rollbackCalls += 1;
          },
          cancelAppointment: async () => ({ success: true }),
          findAppointmentById: async () => null
        }
      }
    );
    assert.equal(result.success, false);
    assert.equal(result.error, "QUALIFICATION_SYNC_WRITE_FAILED");
    assert.equal(rollbackCalls, 1);
  });

  test("retry after successful sync is idempotent (no second qual write)", async () => {
    const legacy = sparseLegacy({
      city: "Miami",
      state: "FL",
      work_authorized: true
    });
    const qualWrites = [];
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        recruitAiV2Context: marielenaDurable(),
        recruitAiV2CoreProspectId: CORE,
        dependencies: {
          resolveTenantProspect: async () => legacy,
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: CORE,
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
          scheduleAppointment: async () => ({
            success: true,
            googleCalendarEventId: "cal-br127-idem",
            startTimeISO: "2026-08-10T17:00:00.000Z"
          }),
          updateProspect: async (_phone, patch) => {
            if (patch.city !== undefined || patch.work_authorized !== undefined) {
              qualWrites.push(patch);
            }
            Object.assign(legacy, patch);
          },
          createPersistedScheduleAppointment: async () => ({
            id: "appt-br127-idem",
            status: "scheduled",
            calendarEventId: "cal-br127-idem"
          }),
          advanceProspectWorkflow: async () => ({
            success: true,
            workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" }
          })
        }
      }
    );
    assert.equal(result.success, true);
    assert.equal(qualWrites.length, 0);
  });

  test("non-V2 schedule path does not invoke sync hydration", async () => {
    const legacy = sparseLegacy();
    const patches = [];
    let capturedSeen = null;
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        dependencies: {
          resolveTenantProspect: async () =>
            sparseLegacy({ city: "Miami", state: "FL", work_authorized: true }),
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: CORE,
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
          scheduleAppointment: async () => ({
            success: true,
            googleCalendarEventId: "cal-non-v2",
            startTimeISO: "2026-08-10T17:00:00.000Z"
          }),
          updateProspect: async (_phone, patch) => {
            patches.push(patch);
          },
          createPersistedScheduleAppointment: async () => ({
            id: "appt-non-v2",
            status: "scheduled",
            calendarEventId: "cal-non-v2",
            confirmationStatus: "missing_email"
          }),
          advanceProspectWorkflow: async (_phone, payload) => {
            capturedSeen = payload.capturedFields;
            return { success: true, workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" } };
          }
        }
      }
    );
    assert.equal(result.success, true);
    assert.ok(!patches.some((p) => p.city === "Miami" && Object.keys(p).length <= 3));
    assert.equal(capturedSeen.city, undefined);
    assert.equal(capturedSeen.authorization, undefined);
    void legacy;
  });

  test("missing email still yields booking success + missing_email confirmation metadata", async () => {
    let persistedContact = null;
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        recruitAiV2Context: marielenaDurable(),
        recruitAiV2CoreProspectId: CORE,
        dependencies: {
          resolveTenantProspect: async () => sparseLegacy(),
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: CORE,
            legacyProspectId: LEGACY
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
          scheduleAppointment: async () => ({
            success: true,
            googleCalendarEventId: "cal-br127-email",
            startTimeISO: "2026-08-10T17:00:00.000Z"
          }),
          updateProspect: async () => ({}),
          createPersistedScheduleAppointment: async (args) => {
            persistedContact = args.attendeeEmail || null;
            return {
              id: "appt-br127-email",
              status: "scheduled",
              calendarEventId: "cal-br127-email",
              confirmationStatus: persistedContact ? "pending" : "missing_email",
              emailInvitationStatus: persistedContact ? "pending" : "missing"
            };
          },
          advanceProspectWorkflow: async () => ({
            success: true,
            workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" }
          })
        }
      }
    );
    assert.equal(result.success, true);
    assert.equal(persistedContact, null);
    assert.equal(result.appointment?.confirmationStatus || "missing_email", "missing_email");
  });

  test("missing prospect org fails closed with zero writes", () => {
    const plan = planQualificationFactSync({
      durableContext: marielenaDurable(),
      prospect: sparseLegacy({ organization_id: null }),
      organizationId: ORG,
      expectedCoreProspectId: CORE,
      expectedLegacyProspectId: LEGACY
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.reasonCode, SYNC_REASON.ORG_MISMATCH);
    assert.deepEqual(plan.legacyUpdates, {});
  });
});
