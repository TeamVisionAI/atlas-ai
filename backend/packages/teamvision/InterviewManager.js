/**
 * Release 1.1 — Interview scheduling via existing Atlas business services.
 */

const { createFromInterviewRequest } = require("../../appointments/AppointmentService");
const { createMeetingFromAppointment } = require("../../meetings/MeetingService");
const { buildReminders } = require("../../meetings/ReminderService");
const { PackageEvent } = require("./PackageEvents");

class InterviewManager {
  /**
   * @param {Object} deps
   * @param {import('../../communication/events/EventBus').EventBus|null} [deps.eventBus]
   * @param {Object} [deps.configuration]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.configuration = deps.configuration || {};
  }

  /**
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async scheduleInterview(params) {
    const interview = {
      name: params.prospectName,
      email: params.email,
      phone: params.phone,
      city: params.city,
      state: params.state,
      interviewType: params.interviewType || this.resolveInterviewType(params),
      preferredDate: params.preferredDate,
      preferredTime: params.preferredTime
    };

    const confirmed = await createFromInterviewRequest(
      {
        interview,
        collectedData: interview,
        workflow: {
          atlasProspectId: params.prospectId || null,
          workflowId: params.workflowId || null
        }
      },
      this.eventBus
    );

    this.eventBus?.emit(PackageEvent.INTERVIEW_SCHEDULED, {
      appointmentId: confirmed.appointment?.id,
      prospectId: params.prospectId,
      interviewType: interview.interviewType
    });

    return confirmed;
  }

  /**
   * @param {Object} appointment
   * @returns {Promise<Object>}
   */
  async prepareMeetingResources(appointment) {
    return createMeetingFromAppointment({
      appointment,
      organizationId: appointment.organizationId
    });
  }

  scheduleReminders(meeting) {
    const offsets =
      this.configuration.reminderSchedule?.offsetsMinutes || [1440, 120, 30, 5];

    return buildReminders(meeting, offsets);
  }

  resolveInterviewType(params) {
    const types = this.configuration.interviewTypes || ["office", "zoom"];

    if (params.requestedInterviewType && types.includes(params.requestedInterviewType)) {
      return params.requestedInterviewType;
    }

    if (params.outsideCoverage && this.configuration.recruitingPolicies?.defaultVirtualForOutsideCoverage) {
      return "zoom";
    }

    return types.includes("office") ? "office" : types[0];
  }

  /**
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async completeInterview(params) {
    this.eventBus?.emit(PackageEvent.INTERVIEW_COMPLETED, {
      appointmentId: params.appointmentId,
      prospectId: params.prospectId,
      completedAt: new Date().toISOString()
    });

    return {
      status: "completed",
      appointmentId: params.appointmentId
    };
  }

  async cancelInterview(params) {
    return {
      status: "cancelled",
      appointmentId: params.appointmentId,
      reason: params.reason || null
    };
  }

  async rescheduleInterview(params) {
    await this.cancelInterview({ appointmentId: params.appointmentId, reason: "reschedule" });
    return this.scheduleInterview(params);
  }
}

module.exports = {
  InterviewManager
};
