/**
 * Sprint 13.2 — Interview Assignment (BR-042).
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveInterviewAssignmentForSchedule,
  resolveInterviewRepresentative,
  resolveInterviewerUserId
} = require("../core/interviewAssignmentEngine");
const {
  rowToAppointment,
  appointmentToRow
} = require("../core/appointmentReadModel");
const { buildInterviewBlock } = require("../core/prospectWorkspaceReadModel");

describe("Sprint 13.2 — BR-042 interview assignment", () => {
  it("defaults schedule assignment to authenticated user", async () => {
    const assignment = await resolveInterviewAssignmentForSchedule(
      {},
      { userId: "user-1", organizationId: "org-1" },
      {
        findUserById: async () => ({
          id: "user-1",
          display_name: "Niovel Perez",
          organization_id: "org-1",
          rep_id: "5AAAA"
        }),
        sanitizeUser: (user) => user
      }
    );

    assert.equal(assignment.interviewerUserId, "user-1");
    assert.equal(assignment.interviewerName, "Niovel Perez");
  });

  it("persists explicit interviewer selection from schedule payload", async () => {
    const assignment = await resolveInterviewAssignmentForSchedule(
      { interviewerUserId: "user-2" },
      { userId: "user-1", organizationId: "org-1" },
      {
        findUserById: async (userId) =>
          userId === "user-2"
            ? {
                id: "user-2",
                display_name: "Ana Perez",
                organization_id: "org-1",
                rep_id: "4BBBB"
              }
            : null,
        sanitizeUser: (user) => user
      }
    );

    assert.equal(assignment.interviewerUserId, "user-2");
    assert.equal(assignment.interviewerName, "Ana Perez");
  });

  it("resolveInterviewRepresentative reads interviewer_user_id not ownerRepId", async () => {
    const resolved = await resolveInterviewRepresentative(
      {
        id: "appt-1",
        ownerRepId: "4TJLK",
        interviewerUserId: "user-2",
        interviewerName: "Ana Perez",
        organizationId: "org-1"
      },
      { organizationId: "org-1" },
      {
        findUserById: async (userId) =>
          userId === "user-2"
            ? {
                id: "user-2",
                display_name: "Ana Perez",
                organization_id: "org-1",
                rep_id: "4BBBB"
              }
            : null,
        sanitizeUser: (user) => user
      }
    );

    assert.equal(resolved.profile.name, "Ana Perez");
    assert.equal(resolved.interviewerUserId, "user-2");
  });

  it("appointment read model round-trips interviewer fields", () => {
    const row = appointmentToRow({
      id: "appt-1",
      organizationId: "org-1",
      prospectPhone: "+15555550100",
      agentId: "user-1",
      purpose: "recruiting_interview",
      status: "scheduled",
      source: "mission_control",
      startDateTime: "2026-08-01T15:00:00.000Z",
      endDateTime: "2026-08-01T15:30:00.000Z",
      durationMinutes: 30,
      timezone: "America/New_York",
      meetingType: "virtual",
      interviewerUserId: "user-2",
      interviewerName: "Ana Perez",
      ownerRepId: "4TJLK",
      metadata: {}
    });

    const appointment = rowToAppointment(row);

    assert.equal(appointment.interviewerUserId, "user-2");
    assert.equal(appointment.interviewerName, "Ana Perez");
    assert.equal(row.interviewer_user_id, "user-2");
    assert.equal(row.metadata.interviewerUserId, "user-2");
  });

  it("workspace interview block exposes interviewer assignment", () => {
    const interview = buildInterviewBlock(
      { phone: "+15555550100" },
      { outcome: null },
      { active: false },
      {
        id: "appt-1",
        startDateTime: "2026-08-01T15:00:00.000Z",
        meetingType: "virtual",
        interviewerUserId: "user-2",
        interviewerName: "Ana Perez"
      }
    );

    assert.equal(interview.interviewerUserId, "user-2");
    assert.equal(interview.interviewerName, "Ana Perez");
  });
});
