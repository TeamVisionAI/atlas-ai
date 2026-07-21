/**
 * Journey #2 Increment 2 — Appointment confirmation generation.
 * Builds confirmation objects and messages only. No delivery channels.
 */

const MEETING_TYPE = Object.freeze({
  ZOOM: "zoom",
  OFFICE: "office",
  STARBUCKS: "starbucks",
  CUSTOM: "custom"
});

function formatDateLabel(isoString, timeZone) {
  return new Date(isoString).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone
  });
}

function formatTimeLabel(isoString, timeZone) {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone
  });
}

/**
 * @param {Object|null} organization
 * @param {string} interviewType
 * @returns {{ meetingType: string, locationName: string|null, address: string|null, meetingUrl: string|null }}
 */
function resolveMeetingDetails(organization, interviewType) {
  const settings = organization?.settings || {};
  const normalizedType = String(interviewType || "").toLowerCase();

  if (normalizedType.includes("zoom") || normalizedType === "zoom") {
    return {
      meetingType: MEETING_TYPE.ZOOM,
      locationName: "Zoom",
      address: null,
      meetingUrl: settings.zoom_interview_url || null
    };
  }

  if (
    (normalizedType.includes("starbucks") || settings.meeting_locations?.starbucks) &&
    settings.starbucks_preference
  ) {
    return {
      meetingType: MEETING_TYPE.STARBUCKS,
      locationName: "Starbucks",
      address: settings.starbucks_preference,
      meetingUrl: null
    };
  }

  if (
    (normalizedType.includes("custom") || settings.meeting_locations?.custom) &&
    (settings.custom_location_name || settings.custom_location_address)
  ) {
    return {
      meetingType: MEETING_TYPE.CUSTOM,
      locationName: settings.custom_location_name || "Meeting Location",
      address: settings.custom_location_address || null,
      meetingUrl: null
    };
  }

  return {
    meetingType: MEETING_TYPE.OFFICE,
    locationName: "Team Vision Office",
    address: settings.office_address || "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    meetingUrl: null
  };
}

function buildConfirmationMessage(details) {
  const lines = ["You're all set!", ""];

  if (details.meetingType === MEETING_TYPE.ZOOM) {
    lines.push("Your interview has been scheduled.", "");
  } else if (details.meetingType === MEETING_TYPE.STARBUCKS) {
    lines.push("Your meeting has been scheduled.", "");
  } else {
    lines.push("Your interview has been scheduled.", "");
  }

  lines.push("Date:", details.date, "", "Time:", details.time, "");

  if (details.meetingType === MEETING_TYPE.ZOOM) {
    lines.push("Meeting:", "Zoom", "");

    if (details.meetingUrl) {
      lines.push("Link:", details.meetingUrl, "");
    }

    lines.push("We look forward to meeting you!");
    return lines.join("\n");
  }

  if (details.meetingType === MEETING_TYPE.STARBUCKS) {
    lines.push("Location:", "Starbucks", "");

    if (details.address) {
      lines.push("Address:", details.address, "");
    }

    lines.push("See you there!");
    return lines.join("\n");
  }

  if (details.meetingType === MEETING_TYPE.CUSTOM) {
    lines.push("Location:", details.locationName || "Meeting Location", "");

    if (details.address) {
      lines.push("Address:", details.address, "");
    }

    lines.push("See you there!");
    return lines.join("\n");
  }

  lines.push("Location:", details.locationName || "Team Vision Office", "");

  if (details.address) {
    lines.push("Address:", details.address, "");
  }

  lines.push("", "We look forward to meeting you!");
  return lines.join("\n");
}

/**
 * @param {Object} appointment
 * @param {Object|null} organization
 * @returns {Object}
 */
function buildConfirmation(appointment, organization = null) {
  const timeZone = appointment.timeZone || "America/New_York";
  const meeting = resolveMeetingDetails(organization, appointment.interviewType);
  const date = formatDateLabel(appointment.startTime, timeZone);
  const time = formatTimeLabel(appointment.startTime, timeZone);

  const confirmation = {
    appointmentId: appointment.id,
    prospectName: appointment.prospectName,
    meetingType: meeting.meetingType,
    date,
    time,
    timezone: timeZone,
    locationName: meeting.locationName,
    address: meeting.address,
    meetingUrl: meeting.meetingUrl,
    createdAt: new Date().toISOString()
  };

  confirmation.confirmationMessage = buildConfirmationMessage({
    ...confirmation,
    meetingType: meeting.meetingType
  });

  return confirmation;
}

module.exports = {
  MEETING_TYPE,
  resolveMeetingDetails,
  buildConfirmationMessage,
  buildConfirmation
};
