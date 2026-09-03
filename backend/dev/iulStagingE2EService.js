/**
 * BR-223 — Guarded Atlas Staging calendar helpers + ephemeral booking persistence.
 * Calendar create for certification goes through schedulingService.createCalendarEvent,
 * not through createStagingSimulatorEvent.
 */

"use strict";

const crypto = require("crypto");
const { google } = require("googleapis");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const { buildIsoTimestamp } = require("../services/availabilityService");
const {
  SIMULATOR_EVENT_TITLE_PREFIX,
  resolveStagingCalendarConfig,
  buildGuardError
} = require("./iulStagingCalendarGuard");
const { buildSimulatorEventDescription } = require("./iulStagingBookingGrant");

const SIMULATOR_EMAIL_PLACEHOLDER = "atlas-iul-simulator@teamvision.internal";
const AVAILABILITY_PROVIDER = "appointmentApplicationService.getSlots";

function createSimulatorRunId() {
  return `iul-sim-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function slotToIsoRange(slot, timezone = "America/New_York") {
  const dateKey = slot?.dateKey || slot?.date;
  const timeKey = slot?.timeKey || slot?.time;
  if (!dateKey || !timeKey) {
    throw buildGuardError("Selected slot is missing date/time for staging booking.");
  }
  const startTimeISO = buildIsoTimestamp(dateKey, timeKey, timezone);
  const endTimeISO = new Date(new Date(startTimeISO).getTime() + 60 * 60 * 1000).toISOString();
  return { startTimeISO, endTimeISO, timezone };
}

async function getPersonalCalendarClient(stagingConfig) {
  const { oauth2Client } = await googleCalendarIntegrationService.getAuthorizedClient(
    stagingConfig.organizationId,
    {
      userId: stagingConfig.userId,
      personalOnly: true,
      allowOrgLegacyFallback: false
    }
  );

  if (!oauth2Client) {
    throw buildGuardError("Personal Google Calendar authorization is unavailable.");
  }

  return {
    calendar: google.calendar({ version: "v3", auth: oauth2Client }),
    calendarId: stagingConfig.calendarId
  };
}

async function findSimulatorEvents(stagingConfig, simulatorRunId) {
  const { calendar, calendarId } = await getPersonalCalendarClient(stagingConfig);
  const response = await calendar.events.list({
    calendarId,
    q: SIMULATOR_EVENT_TITLE_PREFIX,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50
  });

  const items = response.data?.items || [];
  return items.filter((event) => {
    const description = String(event.description || "");
    const summary = String(event.summary || "");
    return (
      summary.includes(SIMULATOR_EVENT_TITLE_PREFIX) &&
      description.includes(`simulatorRunId=${simulatorRunId}`)
    );
  });
}

async function cleanupStagingSimulatorEvents({ req, simulatorRunId, stagingConfig = null }) {
  const config =
    stagingConfig ||
    (await resolveStagingCalendarConfig(req, { explicitStagingMode: true }));

  if (!simulatorRunId) {
    throw buildGuardError("simulatorRunId is required for cleanup.");
  }

  const { calendar, calendarId } = await getPersonalCalendarClient(config);
  const matches = await findSimulatorEvents(config, simulatorRunId);
  const deleted = [];

  for (const event of matches) {
    await calendar.events.delete({ calendarId, eventId: event.id });
    deleted.push({ eventId: event.id, summary: event.summary });
  }

  return {
    simulatorRunId,
    calendarName: config.calendarName,
    deletedCount: deleted.length,
    deleted,
    retained: [],
    status: deleted.length ? "complete" : "none_found"
  };
}

async function getStagingEventByRunId(stagingConfig, simulatorRunId) {
  const matches = await findSimulatorEvents(stagingConfig, simulatorRunId);
  return matches[0] || null;
}

function createEphemeralAppointmentStore({ grant, prospectId, phone } = {}) {
  const appointments = [];
  let calendarCreateCount = 0;

  return {
    appointments,
    get calendarCreateCount() {
      return calendarCreateCount;
    },
    incrementCalendarCreate() {
      calendarCreateCount += 1;
    },
    async findActiveAppointmentForProspect() {
      return appointments[appointments.length - 1] || null;
    },
    async findAppointmentById(id) {
      return appointments.find((row) => row.id === id) || null;
    },
    async createPersistedScheduleAppointment({
      organizationId,
      agentId,
      payload,
      bookingResult,
      isZoom
    }) {
      const { startTimeISO } = slotToIsoRange(
        { dateKey: payload.dateKey, timeKey: payload.timeKey },
        payload.timezone || "America/New_York"
      );
      const meetingUrl = isZoom
        ? bookingResult.meetingUrl || bookingResult.zoomLink || grant?.personalZoomUrl || null
        : null;
      const record = {
        id: `sim-iul-appt-${appointments.length + 1}-${grant?.simulatorRunId || "run"}`,
        status: "confirmed",
        organizationId,
        organization_id: organizationId,
        agentId,
        agent_id: agentId,
        prospectId,
        prospect_id: prospectId,
        metadata: { coreProspectId: prospectId },
        startDateTime: bookingResult.startTimeISO || startTimeISO,
        start_date_time: bookingResult.startTimeISO || startTimeISO,
        calendarEventId: bookingResult.googleCalendarEventId || null,
        calendar_event_id: bookingResult.googleCalendarEventId || null,
        meetingUrl,
        meeting_url: meetingUrl,
        zoomJoinUrl: meetingUrl,
        prospectPhone: phone
      };
      appointments.push(record);
      return record;
    },
    async resolveTenantProspect() {
      return {
        id: prospectId,
        phone,
        name: "Atlas IUL Simulator"
      };
    },
    async resolveCanonicalProspectIdentity() {
      return {
        ok: true,
        coreProspectId: prospectId,
        legacyProspectId: prospectId
      };
    },
    async updateProspect() {
      return { skipped: "iul_staging_e2e" };
    },
    async advanceProspectWorkflow() {
      return { success: true, workflow: null, skipped: "iul_staging_e2e" };
    },
    async rollbackPersistedAppointment() {
      return { rolledBack: true };
    }
  };
}

function createStagingBookingDependencies({
  grant,
  prospectId,
  phone,
  getSlotsImpl = null,
  scheduleAppointmentImpl = null,
  resolveCanonicalVirtualMeetingUrl = null,
  availabilityEvidence = null
} = {}) {
  const store = createEphemeralAppointmentStore({ grant, prospectId, phone });
  const evidence = availabilityEvidence || {
    provider: AVAILABILITY_PROVIDER,
    calendarId: grant.calendarId,
    calendarName: grant.calendarName
  };

  async function getSlots(params) {
    evidence.provider = AVAILABILITY_PROVIDER;
    evidence.calendarId = grant.calendarId;
    evidence.calendarName = grant.calendarName;
    if (typeof getSlotsImpl === "function") {
      return getSlotsImpl({ ...params, stagingCalendarTarget: grant });
    }
    return require("../application/appointmentApplicationService").getSlots({
      ...params,
      organizationId: grant.organizationId,
      agentId: grant.userId,
      interviewerUserId: grant.userId
    });
  }

  async function resolveInterviewLocation(_orgId, interviewType) {
    const isZoom = String(interviewType || "").toLowerCase() === "zoom";
    if (isZoom) {
      return {
        configured: Boolean(grant.personalZoomUrl),
        meetingUrl: grant.personalZoomUrl,
        location: grant.personalZoomUrl,
        errorCode: grant.personalZoomUrl ? null : "MEETING_URL_NOT_CONFIGURED"
      };
    }
    return {
      configured: Boolean(grant.officeAddress),
      meetingUrl: null,
      location: grant.officeAddress,
      errorCode: grant.officeAddress ? null : "OFFICE_LOCATION_REQUIRED"
    };
  }

  async function executeScheduleInterview(phoneArg, payload, opts) {
    const { executeScheduleInterview: realExecute } = require("../application/missionExecutionApplicationService");
    return realExecute(phoneArg, payload, {
      ...opts,
      iulStagingE2EGrant: grant,
      dependencies: {
        ...(opts?.dependencies || {}),
        resolveTenantProspect: store.resolveTenantProspect,
        resolveCanonicalProspectIdentity: store.resolveCanonicalProspectIdentity,
        createPersistedScheduleAppointment: store.createPersistedScheduleAppointment,
        updateProspect: store.updateProspect,
        advanceProspectWorkflow: store.advanceProspectWorkflow,
        rollbackPersistedAppointment: store.rollbackPersistedAppointment,
        findAppointmentById: store.findAppointmentById,
        getSlots,
        resolveInterviewLocation,
        ...(resolveCanonicalVirtualMeetingUrl
          ? { resolveCanonicalVirtualMeetingUrl }
          : {}),
        getGoogleCalendarIntegrationStatus: async () => ({
          connected: true,
          calendarId: grant.calendarId
        }),
        scheduleAppointment: async (input) => {
          store.incrementCalendarCreate();
          if (typeof scheduleAppointmentImpl === "function") {
            return scheduleAppointmentImpl(input);
          }
          return require("../services/schedulingService").scheduleAppointment(input);
        }
      }
    });
  }

  return {
    store,
    evidence,
    getSlots,
    executeScheduleInterview,
    findActiveAppointmentForProspect: store.findActiveAppointmentForProspect,
    findAppointmentById: store.findAppointmentById
  };
}

function certifyIulStagingBooking({
  meetingMode,
  bookingResult,
  renderedText,
  reasonCodes = [],
  configuredZoomUrl,
  officeAddress,
  calendarEvent,
  calendarCreateCount,
  replayCalendarCreateCount
} = {}) {
  const failures = [];
  const reply = String(renderedText || "");
  const bookingZoom =
    bookingResult?.meetingUrl ||
    bookingResult?.zoomLink ||
    bookingResult?.zoomJoinUrl ||
    bookingResult?.scheduleResult?.meetingUrl ||
    bookingResult?.scheduleResult?.zoomLink ||
    null;
  const eventZoom =
    calendarEvent?.location ||
    calendarEvent?.zoomUrl ||
    null;

  if (!bookingResult?.success && !bookingResult?.appointmentId) {
    failures.push({ path: "bookingOrchestration", expected: "success", actual: bookingResult || null });
  }
  if (!calendarEvent?.id && !calendarEvent?.eventId) {
    failures.push({ path: "stagingCalendarEvent", expected: "exists", actual: calendarEvent || null });
  }

  if (meetingMode === "zoom") {
    if (!configuredZoomUrl) {
      failures.push({ path: "configuredZoomUrl", expected: "present", actual: null });
    }
    if (!bookingZoom || bookingZoom !== configuredZoomUrl) {
      failures.push({
        path: "bookingResultZoomUrl",
        expected: configuredZoomUrl,
        actual: bookingZoom
      });
    }
    if (!reply.includes(configuredZoomUrl || "___missing___")) {
      failures.push({
        path: "finalConfirmationZoomUrl",
        expected: configuredZoomUrl,
        actual: reply.slice(0, 240)
      });
    }
    if ((reasonCodes || []).includes("IUL_ZOOM_LINK_MISSING")) {
      failures.push({
        path: "IUL_ZOOM_LINK_MISSING",
        expected: "absent",
        actual: reasonCodes
      });
    }
    if (eventZoom === configuredZoomUrl && !reply.includes(configuredZoomUrl || "")) {
      failures.push({
        path: "calendarOnlyZoomDoesNotPass",
        expected: "confirmation must include Zoom URL",
        actual: "calendarEvent.zoomUrl only"
      });
    }
  } else {
    if (reply.toLowerCase().includes("zoom.us") || reply.toLowerCase().includes("zoom")) {
      failures.push({
        path: "officeConfirmationExcludesZoom",
        expected: "no Zoom URL",
        actual: reply.slice(0, 240)
      });
    }
    if (officeAddress && calendarEvent?.location && calendarEvent.location !== officeAddress) {
      failures.push({
        path: "officeAddress",
        expected: officeAddress,
        actual: calendarEvent.location
      });
    }
  }

  if (calendarCreateCount != null && calendarCreateCount !== 1) {
    failures.push({
      path: "firstBookingEventCount",
      expected: 1,
      actual: calendarCreateCount
    });
  }
  if (replayCalendarCreateCount != null && replayCalendarCreateCount !== calendarCreateCount) {
    failures.push({
      path: "idempotentReplayEventCount",
      expected: calendarCreateCount,
      actual: replayCalendarCreateCount
    });
  }

  return { pass: failures.length === 0, failures };
}

module.exports = {
  SIMULATOR_EMAIL_PLACEHOLDER,
  AVAILABILITY_PROVIDER,
  createSimulatorRunId,
  slotToIsoRange,
  cleanupStagingSimulatorEvents,
  getStagingEventByRunId,
  findSimulatorEvents,
  buildSimulatorEventDescription,
  createEphemeralAppointmentStore,
  createStagingBookingDependencies,
  certifyIulStagingBooking
};
