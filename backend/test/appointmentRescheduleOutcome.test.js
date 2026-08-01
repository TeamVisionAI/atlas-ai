require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const PERSISTED_APPOINTMENT_ID = "550e8400-e29b-41d4-a716-446655440001";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

test("rescheduleAppointment with skipSlotValidation uses canonical repository persistence", async () => {
  const repoPath = require.resolve("../repositories/appointmentRepository");
  const schedulingPath = require.resolve("../services/appointmentSchedulingEngine");
  const reminderPath = require.resolve("../services/appointmentReminderEngine");
  const supabaseServicePath = require.resolve("../services/supabaseService");
  const eventAdapterPath = require.resolve("../modules/appointments/application/appointmentEventAdapter");
  const servicePath = require.resolve("../application/appointmentApplicationService");

  const repoModule = require(repoPath);
  const schedulingModule = require(schedulingPath);
  const reminderModule = require(reminderPath);
  const supabaseService = require(supabaseServicePath);
  const eventAdapter = require(eventAdapterPath);

  const originalFindById = repoModule.findById;
  const originalSave = repoModule.save;
  const originalGetAvailableSlots = schedulingModule.getAvailableSlots;
  const originalCancelReminders = reminderModule.cancelReminders;
  const originalReplaceReminders = reminderModule.replaceReminders;
  const originalUpdateProspect = supabaseService.updateProspect;
  const originalFindProspectInOrganization = supabaseService.findProspectInOrganization;
  const originalEmitLifecycle = eventAdapter.emitAppointmentLifecycleEvent;

  const savedRows = [];
  let slotsRequested = false;

  const baseAppointment = {
    id: PERSISTED_APPOINTMENT_ID,
    organizationId: ORGANIZATION_ID,
    prospectPhone: "+15559876543",
    agentId: "agent-1",
    purpose: "recruiting_interview",
    status: "scheduled",
    durationMinutes: 30,
    timezone: "America/New_York",
    confirmationStatus: "confirmed",
    reminderStatus: "scheduled",
    startDateTime: "2026-08-01T15:00:00.000Z",
    endDateTime: "2026-08-01T15:30:00.000Z",
    metadata: { lifecycleState: "scheduled" }
  };

  repoModule.findById = async (id, organizationId) =>
    id === PERSISTED_APPOINTMENT_ID && organizationId === ORGANIZATION_ID ? baseAppointment : null;
  repoModule.save = async (appointment) => {
    savedRows.push(appointment);
    return appointment;
  };
  schedulingModule.getAvailableSlots = async () => {
    slotsRequested = true;
    return { slots: [] };
  };
  reminderModule.cancelReminders = () => null;
  reminderModule.replaceReminders = () => ({ status: "scheduled" });
  supabaseService.updateProspect = async () => null;
  supabaseService.findProspectInOrganization = async () => ({ name: "Test Prospect" });
  eventAdapter.emitAppointmentLifecycleEvent = async () => null;

  const domainServicePath = require.resolve("../modules/appointments/application/appointmentDomainService");
  delete require.cache[domainServicePath];
  delete require.cache[servicePath];
  const { rescheduleAppointment } = require(servicePath);

  const scheduledTime = "2026-08-05T18:00:00.000Z";
  const saved = await rescheduleAppointment(
    PERSISTED_APPOINTMENT_ID,
    {
      reason: "prospect_requested",
      dateKey: "2026-08-05",
      timeKey: "14:00",
      scheduledTime,
      skipSlotValidation: true,
      skipWorkflowAdvance: true
    },
    { organizationId: ORGANIZATION_ID, agentId: "agent-1" }
  );

  assert.equal(slotsRequested, false);
  assert.equal(saved.startDateTime, scheduledTime);
  assert.equal(savedRows.length, 2);
  assert.equal(savedRows[0].startDateTime, scheduledTime);
  assert.equal(savedRows[0].status, "rescheduled");

  repoModule.findById = originalFindById;
  repoModule.save = originalSave;
  schedulingModule.getAvailableSlots = originalGetAvailableSlots;
  reminderModule.cancelReminders = originalCancelReminders;
  reminderModule.replaceReminders = originalReplaceReminders;
  supabaseService.updateProspect = originalUpdateProspect;
  supabaseService.findProspectInOrganization = originalFindProspectInOrganization;
  eventAdapter.emitAppointmentLifecycleEvent = originalEmitLifecycle;
  delete require.cache[domainServicePath];
  delete require.cache[servicePath];
});
