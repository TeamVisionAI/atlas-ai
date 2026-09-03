/**
 * BR-223 — IUL Workflow Simulator staging calendar writes (guarded).
 * Creates/deletes tagged events only on the verified Atlas Staging calendar.
 */

"use strict";

const crypto = require("crypto");
const { google } = require("googleapis");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const {
  SIMULATOR_EVENT_TITLE_PREFIX,
  resolveStagingCalendarConfig,
  buildGuardError
} = require("./iulStagingCalendarGuard");

const SIMULATOR_EMAIL_PLACEHOLDER = "atlas-iul-simulator@teamvision.internal";

function createSimulatorRunId() {
  return `iul-sim-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function buildSimulatorEventDescription({
  simulatorRunId,
  scenarioId,
  meetingMode,
  slot,
  timezone,
  environment
}) {
  return [
    "Atlas IUL Workflow Simulator event",
    `simulatorRunId=${simulatorRunId}`,
    `scenarioId=${scenarioId || "unknown"}`,
    "createdBy=workflow-simulator",
    `environment=${environment || process.env.NODE_ENV || "development"}`,
    `meetingMode=${meetingMode || "unknown"}`,
    `selectedDate=${slot?.dateKey || slot?.date || "unknown"}`,
    `selectedTime=${slot?.timeKey || slot?.time || "unknown"}`,
    `timezone=${timezone || slot?.timezone || "America/New_York"}`
  ].join("\n");
}

function slotToIsoRange(slot, timezone = "America/New_York") {
  const dateKey = slot?.dateKey || slot?.date;
  const timeKey = slot?.timeKey || slot?.time;
  if (!dateKey || !timeKey) {
    throw buildGuardError("Selected slot is missing date/time for staging booking.");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0));
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startTimeISO: start.toISOString(),
    endTimeISO: end.toISOString(),
    timezone
  };
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

async function createStagingSimulatorEvent({
  stagingConfig,
  simulatorRunId,
  scenarioId,
  meetingMode,
  slot,
  zoomUrl = null,
  officeAddress = null
}) {
  const { calendar, calendarId } = await getPersonalCalendarClient(stagingConfig);
  const { startTimeISO, endTimeISO, timezone } = slotToIsoRange(
    slot,
    slot?.timezone || stagingConfig.timezone || "America/New_York"
  );

  const isZoom = String(meetingMode || "").toLowerCase() === "zoom";
  const description = buildSimulatorEventDescription({
    simulatorRunId,
    scenarioId,
    meetingMode,
    slot,
    timezone,
    environment: stagingConfig.environment
  });

  const requestBody = {
    summary: `${SIMULATOR_EVENT_TITLE_PREFIX} ${isZoom ? "Zoom" : "Office"} Policy Review`,
    description,
    start: { dateTime: startTimeISO, timeZone: timezone },
    end: { dateTime: endTimeISO, timeZone: timezone }
  };

  if (isZoom && zoomUrl) {
    requestBody.location = zoomUrl;
    requestBody.description = `${description}\nzoomUrl=${zoomUrl}`;
  } else if (!isZoom && officeAddress) {
    requestBody.location = officeAddress;
  }

  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "none",
    conferenceDataVersion: 0,
    requestBody
  });

  return {
    eventId: response.data.id,
    htmlLink: response.data.htmlLink || null,
    calendarId,
    calendarName: stagingConfig.calendarName,
    simulatorRunId,
    meetingMode,
    slot,
    zoomUrl: isZoom ? zoomUrl : null,
    officeAddress: isZoom ? null : officeAddress,
    created: true
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

module.exports = {
  SIMULATOR_EMAIL_PLACEHOLDER,
  createSimulatorRunId,
  createStagingSimulatorEvent,
  cleanupStagingSimulatorEvents,
  getStagingEventByRunId,
  findSimulatorEvents,
  buildSimulatorEventDescription
};
