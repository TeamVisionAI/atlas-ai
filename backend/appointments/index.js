/**
 * Journey #2 — Appointment module exports.
 */

const { AppointmentEvent } = require("./AppointmentEvents");
const { createFromInterviewRequest, getDashboardData } = require("./AppointmentService");
const { buildConfirmation } = require("./ConfirmationService");
const {
  AppointmentBookingService,
  createAppointmentBookingService,
  resetAppointmentBookingService
} = require("./AppointmentBookingService");
const {
  PROSPECT_STATUS,
  bookProductionAppointment,
  filterSlotsByGoogleCalendar,
  filterScheduleDaysByGoogleCalendar
} = require("./AppointmentEngine");

module.exports = {
  AppointmentEvent,
  createFromInterviewRequest,
  getDashboardData,
  buildConfirmation,
  AppointmentBookingService,
  createAppointmentBookingService,
  resetAppointmentBookingService,
  PROSPECT_STATUS,
  bookProductionAppointment,
  filterSlotsByGoogleCalendar,
  filterScheduleDaysByGoogleCalendar
};
