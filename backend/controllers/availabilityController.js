/**
 * Sprint 18.2 — Mission Control availability suggestions.
 */

const { getAvailableSlots } = require("../services/availabilityService");
const { APPOINTMENT_TYPES, isValidAppointmentType } = require("../core/configuration/appointmentTypes");

async function getMissionControlAvailability(req, res) {
  try {
    const organizationId = req.authContext?.organizationId || req.tenantContext?.organizationId;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const duration = req.query.duration ? Number(req.query.duration) : undefined;
    const appointmentType = req.query.appointmentType || APPOINTMENT_TYPES.INTERVIEW;

    if (!isValidAppointmentType(appointmentType)) {
      return res.status(400).json({
        error: "INVALID_APPOINTMENT_TYPE",
        message: "Unsupported appointment type."
      });
    }

    const availability = await getAvailableSlots({
      date,
      duration,
      appointmentType,
      organizationId
    });

    return res.json({
      success: true,
      suggestedSlots: availability.slots,
      date: availability.date,
      appointmentType: availability.appointmentType,
      durationMinutes: availability.durationMinutes
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  getMissionControlAvailability
};
