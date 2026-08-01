require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const PERSISTED_APPOINTMENT_ID = "550e8400-e29b-41d4-a716-446655440000";

test("applyInterviewOutcomeToAppointment does not persist Reschedule Interview directly", async () => {
  const repoPath = require.resolve("../repositories/appointmentRepository");
  const syncPath = require.resolve("../core/interviewOutcomeAppointmentSync");
  const repoModule = require(repoPath);
  const originalSave = repoModule.save;
  let saveCalled = false;

  repoModule.save = async () => {
    saveCalled = true;
    return null;
  };

  delete require.cache[syncPath];
  const { applyInterviewOutcomeToAppointment } = require(syncPath);

  const result = await applyInterviewOutcomeToAppointment(
    {
      id: PERSISTED_APPOINTMENT_ID,
      status: "scheduled",
      durationMinutes: 30,
      startDateTime: "2026-08-01T15:00:00.000Z"
    },
    "Reschedule Interview",
    { scheduledTime: "2026-08-05T18:00:00.000Z" }
  );

  assert.equal(saveCalled, false);
  assert.equal(result, null);

  repoModule.save = originalSave;
  delete require.cache[syncPath];
});

test("recordInterviewOutcome delegates Reschedule Interview to appointmentApplicationService", async () => {
  const appointmentServicePath = require.resolve("../application/appointmentApplicationService");
  const outcomeServicePath = require.resolve("../application/interviewOutcomeApplicationService");
  const appointmentService = require(appointmentServicePath);
  const originalReschedule = appointmentService.rescheduleAppointment;
  let rescheduleArgs = null;

  appointmentService.rescheduleAppointment = async (id, input, context) => {
    rescheduleArgs = { id, input, context };
    return {
      id,
      startDateTime: input.scheduledTime,
      status: "rescheduled"
    };
  };

  const supabaseService = require("../services/supabaseService");
  const humanAdvancementEngine = require("../core/humanAdvancementEngine");
  const logService = require("../services/logService");
  const productionProspectFilter = require("../core/productionProspectFilter");
  const resolverPath = require.resolve("../core/activeAppointmentResolver");
  const resolverModule = require(resolverPath);

  const originalFindProspect = supabaseService.findProspect;
  const originalAdvance = humanAdvancementEngine.advanceProspectWorkflow;
  const originalLog = logService.logConversation;
  const originalIsProductionProspect = productionProspectFilter.isProductionProspect;
  const originalFindActive = resolverModule.findActiveAppointmentForProspect;

  supabaseService.findProspect = async () => ({
    phone: "+15551234567",
    name: "Test Prospect",
    current_step: "CONFIRMED",
    language: "en"
  });
  productionProspectFilter.isProductionProspect = () => true;
  humanAdvancementEngine.advanceProspectWorkflow = async () => ({
    success: true,
    workflow: { currentMilestone: "INTERVIEW_SCHEDULED" },
    eventsEmitted: []
  });
  logService.logConversation = async () => null;
  resolverModule.findActiveAppointmentForProspect = async () => ({
    id: PERSISTED_APPOINTMENT_ID,
    status: "scheduled",
    startDateTime: "2026-08-01T15:00:00.000Z"
  });

  delete require.cache[outcomeServicePath];
  const { recordInterviewOutcome } = require(outcomeServicePath);

  const result = await recordInterviewOutcome({
    phone: "+15551234567",
    outcome: "Rescheduled",
    fields: {
      rescheduleDate: "2026-08-05",
      rescheduleTime: "14:00",
      rescheduleInterviewType: "Zoom"
    },
    organizationId: "00000000-0000-4000-8000-000000000001",
    agentId: "agent-1"
  });

  assert.equal(result.success, true);
  assert.equal(rescheduleArgs.id, PERSISTED_APPOINTMENT_ID);
  assert.equal(rescheduleArgs.input.skipSlotValidation, true);
  assert.equal(rescheduleArgs.input.skipWorkflowAdvance, true);
  assert.equal(rescheduleArgs.input.reason, "prospect_requested");
  assert.ok(rescheduleArgs.input.scheduledTime);
  assert.equal(rescheduleArgs.context.organizationId, "00000000-0000-4000-8000-000000000001");
  assert.equal(rescheduleArgs.context.agentId, "agent-1");

  appointmentService.rescheduleAppointment = originalReschedule;
  supabaseService.findProspect = originalFindProspect;
  humanAdvancementEngine.advanceProspectWorkflow = originalAdvance;
  logService.logConversation = originalLog;
  productionProspectFilter.isProductionProspect = originalIsProductionProspect;
  resolverModule.findActiveAppointmentForProspect = originalFindActive;
  delete require.cache[outcomeServicePath];
});
