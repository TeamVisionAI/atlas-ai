/**
 * Journey #5 Increment 3 — Register and resolve tool handlers.
 * Handlers delegate to existing domain services only.
 */

const { createFromInterviewRequest } = require("../../appointments/AppointmentService");
const { createMeetingFromAppointment } = require("../../meetings/MeetingService");
const { createCalendarEvent } = require("../../meetings/CalendarService");
const { serializeAppointment } = require("../../appointments/AppointmentService");

const TOOL_NAMES = Object.freeze({
  APPOINTMENT_SERVICE: "AppointmentService",
  MEETING_SERVICE: "MeetingService",
  CALENDAR_SERVICE: "CalendarService"
});

function createDefaultHandlers(eventBus = null) {
  return {
    [TOOL_NAMES.APPOINTMENT_SERVICE]: {
      scheduleInterview: async (parameters) => {
        const payload = parameters.payload;

        if (!payload) {
          throw new Error("AppointmentService.scheduleInterview requires payload");
        }

        const result = await createFromInterviewRequest(payload, parameters.eventBus || eventBus);
        const organization = payload.organization || null;
        const prospect = payload.prospect || null;

        return {
          appointment: serializeAppointment(result.appointment),
          confirmation: result.confirmation,
          confirmedPayload: {
            appointment: serializeAppointment(result.appointment),
            confirmation: result.confirmation,
            organization,
            prospect
          }
        };
      }
    },
    [TOOL_NAMES.MEETING_SERVICE]: {
      prepareMeeting: async (parameters) => {
        const confirmedPayload =
          parameters.confirmedPayload || parameters.previousResult?.confirmedPayload;

        if (!confirmedPayload?.appointment) {
          throw new Error("MeetingService.prepareMeeting requires confirmed appointment payload");
        }

        const meeting = await createMeetingFromAppointment(confirmedPayload);
        return { meeting };
      }
    },
    [TOOL_NAMES.CALENDAR_SERVICE]: {
      createEvent: async (parameters) => {
        const meeting = parameters.meeting || parameters.previousResult?.meeting;

        if (!meeting) {
          throw new Error("CalendarService.createEvent requires meeting");
        }

        const calendar = await createCalendarEvent(meeting);
        return { meeting, calendar };
      }
    }
  };
}

class ToolRegistry {
  /**
   * @param {Object} [options]
   * @param {Object|null} [options.handlers]
   */
  constructor(options = {}) {
    /** @type {Map<string, Record<string, Function>>} */
    this._tools = new Map();

    const defaults = createDefaultHandlers(options.eventBus);
    const provided = options.handlers || {};

    for (const [toolName, operations] of Object.entries(defaults)) {
      this.register(toolName, operations);
    }

    for (const [toolName, operations] of Object.entries(provided)) {
      this.register(toolName, operations);
    }
  }

  /**
   * @param {string} toolName
   * @param {Record<string, Function>} operations
   */
  register(toolName, operations) {
    const existing = this._tools.get(toolName) || {};
    this._tools.set(toolName, { ...existing, ...operations });
  }

  hasTool(toolName) {
    return this._tools.has(toolName);
  }

  hasOperation(toolName, operation) {
    return Boolean(this._tools.get(toolName)?.[operation]);
  }

  /**
   * @param {string} toolName
   * @param {string} operation
   * @returns {Function|null}
   */
  resolve(toolName, operation) {
    return this._tools.get(toolName)?.[operation] || null;
  }

  listTools() {
    return Array.from(this._tools.keys());
  }

  listOperations(toolName) {
    return Object.keys(this._tools.get(toolName) || {});
  }
}

let singleton = null;

function getToolRegistry(options = {}) {
  if (!singleton) {
    singleton = new ToolRegistry(options);
  }

  return singleton;
}

function resetToolRegistry() {
  singleton = null;
}

module.exports = {
  TOOL_NAMES,
  ToolRegistry,
  getToolRegistry,
  resetToolRegistry,
  createDefaultHandlers
};
