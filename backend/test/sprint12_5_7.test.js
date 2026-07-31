/**
 * Sprint 12.5.7 — Persisted appointment eligibility (BR-040).
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isPersistedAppointment,
  resolvePersistedAppointmentId
} = require("../core/appointmentListQuery");
const { buildInterviewBlock } = require("../core/prospectWorkspaceReadModel");

const OSCAR_ID = "e93a937b-5e9e-4349-ae3b-25ab962b0e96";
const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "00000000-0000-4000-8000-000000000002";

describe("Sprint 12.5.7 — identity-only persisted eligibility", () => {
  it("accepts Oscar UUID even when metadata.derivedFromProspect is true", () => {
    const oscar = {
      id: OSCAR_ID,
      status: "completed",
      metadata: { derivedFromProspect: true }
    };

    assert.equal(isPersistedAppointment(oscar), true);
    assert.equal(resolvePersistedAppointmentId(oscar), OSCAR_ID);
  });

  it("still rejects synthetic prospect-derived ids", () => {
    const synthetic = {
      id: "prospect-derived:+13216891236:1785439800000",
      metadata: { derivedFromProspect: true }
    };

    assert.equal(isPersistedAppointment(synthetic), false);
    assert.equal(resolvePersistedAppointmentId(synthetic), null);
  });

  it("listPersistedAppointments keeps Oscar UUID when metadata.derivedFromProspect is true", async () => {
    const appointmentRepository = require("../repositories/appointmentRepository");
    const { listPersistedAppointments } = require("../services/appointmentListService");
    const originalSearch = appointmentRepository.search;

    appointmentRepository.search = async () => ({
      items: [
        {
          id: OSCAR_ID,
          organizationId: ORG,
          prospectPhone: "+13216891236",
          agentId: AGENT,
          status: "completed",
          startDateTime: "2026-07-30T19:30:00.000Z",
          metadata: { derivedFromProspect: true }
        }
      ],
      total: 1
    });

    try {
      const result = await listPersistedAppointments({
        organizationId: ORG,
        agentId: AGENT,
        status: ["completed", "no_show"]
      });

      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].id, OSCAR_ID);
    } finally {
      appointmentRepository.search = originalSearch;
    }
  });

  it("workspace interview block exposes Oscar persisted UUID", () => {
    const interview = buildInterviewBlock(
      { phone: "+13216891236", calendar_event_id: "cal-1" },
      { outcome: "not_interested" },
      { active: false },
      {
        id: OSCAR_ID,
        startDateTime: "2026-07-30T19:30:00.000Z",
        calendarEventId: "cal-1",
        metadata: { derivedFromProspect: true }
      }
    );

    assert.equal(interview.appointmentId, OSCAR_ID);
  });
});
