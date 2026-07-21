/**
 * Journey #3 — Meeting lifecycle module exports.
 */

const { MeetingEvent } = require("./MeetingEvents");
const {
  MEETING_LIFECYCLE,
  isVirtualMeeting,
  isMeetingReady,
  resolveAttentionItems
} = require("./MeetingLifecycleService");
const {
  MeetingService,
  createMeetingFromAppointment,
  createMeetingService,
  resetMeetingService,
  serializeMeeting
} = require("./MeetingService");
const {
  CalendarService,
  createCalendarEvent,
  createCalendarService,
  resetCalendarService
} = require("./CalendarService");
const {
  ZoomService,
  createZoomMeeting,
  createZoomService,
  resetZoomService
} = require("./ZoomService");
const {
  ReminderService,
  buildReminders,
  createReminderService,
  resetReminderService,
  DEFAULT_OFFSETS_MINUTES
} = require("./ReminderService");
const { getMeetingDashboardData, serializeDashboardMeeting } = require("./MeetingDashboardService");
const meetingStore = require("./MeetingStore");

function createMeetingLifecycle(options = {}) {
  if (!options.eventBus) {
    throw new Error("Meeting lifecycle requires eventBus");
  }

  const lifecycle = {
    meetingService: new MeetingService({ eventBus: options.eventBus }),
    calendarService: new CalendarService({ eventBus: options.eventBus }),
    zoomService: new ZoomService({ eventBus: options.eventBus }),
    reminderService: new ReminderService({ eventBus: options.eventBus })
  };

  lifecycleInstances = lifecycle;
  return lifecycle;
}

let lifecycleInstances = null;

function resetMeetingLifecycle() {
  if (lifecycleInstances) {
    lifecycleInstances.meetingService?.unsubscribe();
    lifecycleInstances.calendarService?.unsubscribe();
    lifecycleInstances.zoomService?.unsubscribe();
    lifecycleInstances.reminderService?.unsubscribe();
  }

  lifecycleInstances = null;
  resetMeetingService();
  resetCalendarService();
  resetZoomService();
  resetReminderService();
}

module.exports = {
  MeetingEvent,
  MEETING_LIFECYCLE,
  isVirtualMeeting,
  isMeetingReady,
  resolveAttentionItems,
  MeetingService,
  createMeetingFromAppointment,
  createMeetingService,
  CalendarService,
  createCalendarEvent,
  createCalendarService,
  ZoomService,
  createZoomMeeting,
  createZoomService,
  ReminderService,
  buildReminders,
  createReminderService,
  DEFAULT_OFFSETS_MINUTES,
  getMeetingDashboardData,
  serializeDashboardMeeting,
  createMeetingLifecycle,
  resetMeetingLifecycle,
  serializeMeeting,
  meetingStore
};
