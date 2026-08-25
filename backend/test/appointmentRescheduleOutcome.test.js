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

test("rescheduleAppointment from already-rescheduled status succeeds (Raquelita regression)", async () => {
  const repoPath = require.resolve("../repositories/appointmentRepository");
  const reminderPath = require.resolve("../services/appointmentReminderEngine");
  const supabaseServicePath = require.resolve("../services/supabaseService");
  const eventAdapterPath = require.resolve("../modules/appointments/application/appointmentEventAdapter");
  const googleSyncPath = require.resolve("../core/appointmentGoogleSyncEngine");
  const virtualUrlPath = require.resolve("../core/virtualMeetingUrlResolver");
  const servicePath = require.resolve("../application/appointmentApplicationService");

  const repoModule = require(repoPath);
  const reminderModule = require(reminderPath);
  const supabaseService = require(supabaseServicePath);
  const eventAdapter = require(eventAdapterPath);
  const googleSync = require(googleSyncPath);
  const virtualUrl = require(virtualUrlPath);

  const originalFindById = repoModule.findById;
  const originalSave = repoModule.save;
  const originalCancelReminders = reminderModule.cancelReminders;
  const originalReplaceReminders = reminderModule.replaceReminders;
  const originalUpdateProspect = supabaseService.updateProspectInOrganization;
  const originalFindProspectInOrganization = supabaseService.findProspectInOrganization;
  const originalEmitLifecycle = eventAdapter.emitAppointmentLifecycleEvent;
  const originalSync = googleSync.syncAppointmentGoogleCalendar;
  const originalVirtualUrl = virtualUrl.resolveCanonicalVirtualMeetingUrl;

  const savedRows = [];
  const calendarEventId = "gcal-raquelita-1";

  const baseAppointment = {
    id: PERSISTED_APPOINTMENT_ID,
    organizationId: ORGANIZATION_ID,
    prospectPhone: "+12392004377",
    agentId: "agent-1",
    purpose: "recruiting_interview",
    status: "rescheduled",
    rescheduleCount: 1,
    durationMinutes: 30,
    timezone: "America/New_York",
    meetingType: "virtual",
    meetingProvider: "zoom",
    confirmationStatus: "confirmed",
    reminderStatus: "scheduled",
    calendarEventId,
    calendarProvider: "google_calendar",
    startDateTime: "2026-08-25T00:30:00.000Z",
    endDateTime: "2026-08-25T01:00:00.000Z",
    metadata: { lifecycleState: "rescheduled", prospectName: "Raquelita" }
  };

  repoModule.findById = async (id, organizationId) =>
    id === PERSISTED_APPOINTMENT_ID && organizationId === ORGANIZATION_ID ? { ...baseAppointment } : null;
  repoModule.save = async (appointment) => {
    savedRows.push(appointment);
    return appointment;
  };
  reminderModule.cancelReminders = async () => null;
  reminderModule.replaceReminders = async () => ({ status: "scheduled" });
  supabaseService.updateProspectInOrganization = async () => null;
  supabaseService.findProspectInOrganization = async () => ({
    name: "Raquelita",
    phone: "+12392004377"
  });
  eventAdapter.emitAppointmentLifecycleEvent = async () => null;
  googleSync.syncAppointmentGoogleCalendar = async (appointment) => ({
    calendarEventId: appointment.calendarEventId || calendarEventId,
    calendarProvider: "google_calendar",
    calendarSyncStatus: "synced",
    calendarSyncError: null,
    action: "updated",
    createdDuplicatePrevented: true
  });
  virtualUrl.resolveCanonicalVirtualMeetingUrl = async () => ({
    url: "https://us02web.zoom.us/j/123",
    status: "configured",
    source: "persisted"
  });

  const domainServicePath = require.resolve("../modules/appointments/application/appointmentDomainService");
  delete require.cache[domainServicePath];
  delete require.cache[servicePath];
  const { rescheduleAppointment } = require(servicePath);

  const scheduledTime = "2026-08-25T15:30:00.000Z";
  const saved = await rescheduleAppointment(
    PERSISTED_APPOINTMENT_ID,
    {
      reason: "agent_requested",
      dateKey: "2026-08-25",
      timeKey: "11:30",
      scheduledTime,
      endDateTime: "2026-08-25T16:00:00.000Z",
      skipSlotValidation: true,
      skipWorkflowAdvance: true
    },
    { organizationId: ORGANIZATION_ID, agentId: "agent-1" }
  );

  assert.equal(saved.status, "rescheduled");
  assert.equal(saved.rescheduleCount, 2);
  assert.equal(saved.startDateTime, scheduledTime);
  assert.equal(saved.calendarEventId, calendarEventId);
  assert.equal(savedRows[0].calendarEventId, calendarEventId);
  assert.equal(savedRows[0].metadata.calendarSyncAction, "updated");

  repoModule.findById = originalFindById;
  repoModule.save = originalSave;
  reminderModule.cancelReminders = originalCancelReminders;
  reminderModule.replaceReminders = originalReplaceReminders;
  supabaseService.updateProspectInOrganization = originalUpdateProspect;
  supabaseService.findProspectInOrganization = originalFindProspectInOrganization;
  eventAdapter.emitAppointmentLifecycleEvent = originalEmitLifecycle;
  googleSync.syncAppointmentGoogleCalendar = originalSync;
  virtualUrl.resolveCanonicalVirtualMeetingUrl = originalVirtualUrl;
  delete require.cache[domainServicePath];
  delete require.cache[servicePath];
});
