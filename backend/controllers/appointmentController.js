/**
 * Sprint 22 — Appointment Engine HTTP controller.
 */

const appointmentApplicationService = require("../application/appointmentApplicationService");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const { resolveAppointmentViewFilters } = require("../core/appointmentListQuery");

function auditMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

function buildListFilters(req) {
  const { view, agentId, purpose, status, meetingType, from, to } = req.query;
  const organizationId = req.tenantContext.organizationId;
  const filters = { organizationId };

  if (agentId) {
    filters.agentId = agentId;
  } else {
    filters.agentId = req.tenantContext.userId;
  }

  if (purpose) {
    filters.purpose = purpose;
  }

  if (meetingType) {
    filters.meetingType = meetingType;
  }

  if (from) {
    filters.from = from;
  }

  if (to) {
    filters.to = to;
  }

  if (status) {
    filters.status = status;
  } else if (view) {
    Object.assign(filters, resolveAppointmentViewFilters(view));
  }

  return filters;
}

async function getProfile(req, res) {
  try {
    const profile = await appointmentApplicationService.getProfile(req.tenantContext.userId);
    const calendarStatus = await googleCalendarIntegrationService.getIntegrationStatus(
      req.tenantContext.organizationId
    );

    res.json({
      profile,
      calendarConnection: googleCalendarIntegrationService.presentIntegrationStatus(calendarStatus)
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function updateProfile(req, res) {
  try {
    const profile = await appointmentApplicationService.updateProfile(
      req.tenantContext.userId,
      req.body,
      auditMeta(req)
    );

    res.json({ profile });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function getAvailableSlots(req, res) {
  try {
    const result = await appointmentApplicationService.getSlots({
      agentId: req.query.agentId || req.tenantContext.userId,
      organizationId: req.tenantContext.organizationId,
      date: req.query.date,
      dateEnd: req.query.dateEnd,
      purpose: req.query.purpose,
      durationMinutes: req.query.duration ? Number(req.query.duration) : undefined,
      timePreference: req.query.timePreference || "any",
      maxResults: req.query.maxResults ? Number(req.query.maxResults) : 8
    });

    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function listAppointments(req, res) {
  try {
    const filters = buildListFilters(req);
    const result = await appointmentApplicationService.listAppointments(filters);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function getAppointment(req, res) {
  try {
    const appointment = await appointmentApplicationService.getAppointment(
      req.params.id,
      req.tenantContext.organizationId
    );
    res.json({ appointment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function createAppointment(req, res) {
  try {
    const appointment = await appointmentApplicationService.createAppointment(
      {
        ...req.body,
        organizationId: req.tenantContext.organizationId,
        agentId: req.body.agentId || req.tenantContext.userId,
        createdBy: req.tenantContext.userId
      },
      { organizationId: req.tenantContext.organizationId }
    );

    res.status(201).json({ appointment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function rescheduleAppointment(req, res) {
  try {
    const appointment = await appointmentApplicationService.rescheduleAppointment(
      req.params.id,
      req.body,
      {
        organizationId: req.tenantContext.organizationId,
        agentId: req.tenantContext.userId
      }
    );

    res.json({ appointment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function cancelAppointment(req, res) {
  try {
    const appointment = await appointmentApplicationService.cancelAppointment(
      req.params.id,
      req.body,
      {
        organizationId: req.tenantContext.organizationId,
        agentId: req.tenantContext.userId
      }
    );

    res.json({ appointment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function completeAppointment(req, res) {
  try {
    const appointment = await appointmentApplicationService.completeAppointment(
      req.params.id,
      req.body,
      {
        organizationId: req.tenantContext.organizationId,
        agentId: req.tenantContext.userId
      }
    );

    res.json({ appointment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function requestHumanAssist(req, res) {
  try {
    const appointment = await appointmentApplicationService.requestHumanAssist(
      req.params.id,
      req.body,
      {
        organizationId: req.tenantContext.organizationId,
        agentId: req.tenantContext.userId
      }
    );

    res.json({ appointment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function resolveHumanAssist(req, res) {
  try {
    const appointment = await appointmentApplicationService.resolveHumanAssist(
      req.params.id,
      req.body,
      {
        organizationId: req.tenantContext.organizationId,
        agentId: req.tenantContext.userId
      }
    );

    res.json({ appointment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function collectEmail(req, res) {
  try {
    const result = await appointmentApplicationService.collectProspectEmail(
      req.params.phone,
      req.body.email,
      req.tenantContext.organizationId
    );

    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

async function sendInterviewDetails(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.sendInterviewDetails(req.params.id, {
      organizationId: req.tenantContext.organizationId,
      actorUser: req.atlasUser || null
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.code || "SERVER_ERROR",
      message: error.message
    });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getAvailableSlots,
  listAppointments,
  getAppointment,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  completeAppointment,
  requestHumanAssist,
  resolveHumanAssist,
  collectEmail,
  sendInterviewDetails
};
