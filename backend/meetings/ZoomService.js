/**
 * Journey #3 — Zoom meeting integration (create only).
 * Journey #7 — Production API calls delegated to ZoomConnector.
 */

const meetingStore = require("./MeetingStore");
const { MeetingEvent } = require("./MeetingEvents");
const { isVirtualMeeting } = require("./MeetingLifecycleService");

function serializeMeeting(meeting) {
  return {
    id: meeting.id,
    appointmentId: meeting.appointmentId,
    organizationId: meeting.organizationId,
    prospectName: meeting.prospectName,
    meetingType: meeting.meetingType,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    timeZone: meeting.timeZone,
    lifecycleStatus: meeting.lifecycleStatus,
    calendar: meeting.calendar,
    zoom: meeting.zoom
  };
}

/**
 * @param {Object} meeting
 * @returns {Promise<Object>}
 */
async function createZoomMeeting(meeting) {
  const { getConnectorRegistry } = require("../connectors");
  const connector = getConnectorRegistry().get("zoom");

  return connector.send({
    operation: "createMeeting",
    meeting
  });
}

class ZoomService {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this._unsubscribers = [];

    if (this.eventBus) {
      this.subscribe(this.eventBus);
    }
  }

  /**
   * @param {import('../communication/events/EventBus').EventBus} eventBus
   */
  subscribe(eventBus) {
    this.unsubscribe();
    this.eventBus = eventBus;
    this._unsubscribers.push(
      eventBus.on(MeetingEvent.CALENDAR_CREATED, (payload) =>
        this._onCalendarCreated(payload)
      )
    );
  }

  unsubscribe() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  async _onCalendarCreated(payload) {
    const meeting = payload.meeting;

    if (!meeting?.id) {
      return;
    }

    if (!isVirtualMeeting(meeting)) {
      const skippedZoom = {
        meetingId: null,
        joinUrl: null,
        hostUrl: null,
        password: null,
        meetingProvider: null,
        status: "skipped"
      };

      await meetingStore.updateMeeting(meeting.id, { zoom: skippedZoom });

      this.eventBus?.emit(MeetingEvent.ZOOM_SKIPPED, {
        meeting: serializeMeeting({ ...meeting, zoom: skippedZoom }),
        reason: "PHYSICAL_MEETING"
      });
      return;
    }

    try {
      const zoom = await createZoomMeeting(meeting);
      const updatedMeeting = await meetingStore.updateMeeting(meeting.id, { zoom });

      await meetingStore.appendActivity({
        type: MeetingEvent.ZOOM_CREATED,
        message: `Zoom meeting created for ${meeting.prospectName}.`,
        meetingId: meeting.id
      });

      this.eventBus?.emit(MeetingEvent.ZOOM_CREATED, {
        meeting: serializeMeeting(updatedMeeting),
        zoom
      });
    } catch (error) {
      console.error("[ZoomService]", error.message);

      const failedZoom = {
        meetingId: null,
        joinUrl: null,
        hostUrl: null,
        password: null,
        meetingProvider: "zoom",
        status: "failed"
      };

      await meetingStore.updateMeeting(meeting.id, { zoom: failedZoom });
    }
  }
}

function createZoomService(options = {}) {
  if (!options.eventBus) {
    throw new Error("ZoomService requires eventBus");
  }

  return new ZoomService({ eventBus: options.eventBus });
}

let singleton = null;

function resetZoomService() {
  if (singleton) {
    singleton.unsubscribe();
  }

  singleton = null;
}

module.exports = {
  ZoomService,
  createZoomMeeting,
  createZoomService,
  resetZoomService
};
