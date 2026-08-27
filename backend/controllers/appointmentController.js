/**
 * Sprint 22 — Appointment Engine HTTP controller.
 */

const appointmentApplicationService = require("../application/appointmentApplicationService");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const icloudCalendarIntegrationService = require("../services/icloudCalendarIntegrationService");
const meetingManagementService = require("../services/meetingManagementService");
const { resolveAppointmentViewFilters } = require("../core/appointmentListQuery");
const {
  FULL_DAY_MAX_SLOT_RESULTS
} = require("../core/configuration/appointmentDomain");

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

  // Upcoming/Today lists are intentionally agent-scoped to the session user.
  // Same-org appointments owned by another user (different agent_id) are excluded.
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
    Object.assign(
      filters,
      resolveAppointmentViewFilters(view, new Date(), { organizationId })
    );
  }

  return filters;
}

function presentCalendarSource(status = {}, { available = true } = {}) {
  return {
    available,
    connected: status.connected === true,
    status: status.status || (status.connected ? "connected" : "disconnected"),
    reconnectRequired: Boolean(status.reconnectRequired),
    ownership: status.ownership || "personal",
    googleAccountEmail: status.googleAccountEmail || null,
    appleAccountEmail: status.appleAccountEmail || null,
    calendarDisplayName: status.calendarDisplayName || status.calendarId || null
  };
}

async function getProfile(req, res) {
  try {
    const organizationId = req.tenantContext.organizationId;
    const userId = req.tenantContext.userId;
    const profile = await appointmentApplicationService.getProfile(userId);

    const [googleStatus, icloudStatus, meetingManagement] = await Promise.all([
      googleCalendarIntegrationService.getPersonalIntegrationStatus(organizationId, userId),
      icloudCalendarIntegrationService.getIntegrationStatus(organizationId, userId),
      meetingManagementService.getMeetingManagement(organizationId).catch(() => null)
    ]);

    const personalZoomUrl = profile?.appointmentProfile?.virtualMeeting?.personalMeetingUrl || "";
    const orgZoomUrl = meetingManagement?.personalMeetingUrl || "";
    const zoomConnected = Boolean(String(personalZoomUrl).trim() || String(orgZoomUrl).trim());

    res.json({
      profile,
      calendarConnection: googleStatus,
      calendarSources: {
        google: presentCalendarSource(googleStatus, { available: true }),
        icloud: presentCalendarSource(icloudStatus, {
          available: icloudStatus?.available === true
        })
      },
      zoomStatus: {
        connected: zoomConnected,
        source: String(personalZoomUrl).trim()
          ? "personal"
          : String(orgZoomUrl).trim()
            ? "organization"
            : null
      },
      organizationOffice: {
        address: meetingManagement?.officeAddress || null,
        configured: Boolean(meetingManagement?.officeAddress)
      }
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
      interviewerUserId: req.query.interviewerUserId || null,
      assignmentMode: req.query.assignmentMode || null,
      organizationId: req.tenantContext.organizationId,
      date: req.query.date,
      dateEnd: req.query.dateEnd,
      purpose: req.query.purpose,
      durationMinutes: req.query.duration ? Number(req.query.duration) : undefined,
      timePreference: req.query.timePreference || "any",
      maxResults: req.query.maxResults
        ? Number(req.query.maxResults)
        : FULL_DAY_MAX_SLOT_RESULTS,
      excludeAppointmentId: req.query.excludeAppointmentId || null
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
    console.error("[appointments/reschedule]", {
      appointmentId: req.params.id,
      code: error.code || null,
      statusCode: error.statusCode || 500,
      message: error.message
    });
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

async function previewInterviewDetailsCommunication(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.previewInterviewDetailsCommunication(req.params.id, {
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

async function previewInterviewReminderCommunication(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.previewInterviewReminderCommunication(req.params.id, {
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

async function sendInterviewReminder(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.sendInterviewReminder(req.params.id, {
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

async function previewZoomInvitationCommunication(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.previewZoomInvitationCommunication(req.params.id, {
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

async function sendZoomInvitation(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.sendZoomInvitation(req.params.id, {
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

async function previewOfficeLocationCommunication(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.previewOfficeLocationCommunication(req.params.id, {
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

async function sendOfficeLocation(req, res) {
  try {
    const communicationService = require("../services/communicationService");
    const result = await communicationService.sendOfficeLocation(req.params.id, {
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

async function listUrgentHandoffs(req, res) {
  try {
    const result = await appointmentApplicationService.listUrgentHandoffs({
      organizationId: req.tenantContext.organizationId,
      userId: req.tenantContext.userId
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.code || "SERVER_ERROR",
      message: error.message
    });
  }
}

async function acknowledgeUrgentHandoff(req, res) {
  try {
    const result = await appointmentApplicationService.acknowledgeUrgentHandoff(
      req.params.handoffId,
      {
        organizationId: req.tenantContext.organizationId,
        userId: req.tenantContext.userId
      }
    );
    res.json({ success: true, ...result });
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
  sendInterviewDetails,
  previewInterviewDetailsCommunication,
  previewInterviewReminderCommunication,
  sendInterviewReminder,
  previewZoomInvitationCommunication,
  sendZoomInvitation,
  previewOfficeLocationCommunication,
  sendOfficeLocation,
  listUrgentHandoffs,
  acknowledgeUrgentHandoff
};
