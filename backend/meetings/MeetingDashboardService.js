/**
 * Journey #3 — Home dashboard meeting queries.
 */

const meetingStore = require("./MeetingStore");
const {
  MEETING_LIFECYCLE,
  isVirtualMeeting,
  resolveAttentionItems
} = require("./MeetingLifecycleService");

function isSameDay(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function serializeDashboardMeeting(meeting) {
  const attentionItems = resolveAttentionItems(meeting);
  const virtual = isVirtualMeeting(meeting);

  return {
    id: meeting.id,
    appointmentId: meeting.appointmentId,
    prospectName: meeting.prospectName,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    timeZone: meeting.timeZone,
    meetingType: meeting.meetingType,
    interviewType: meeting.interviewType,
    isVirtual: virtual,
    locationLabel: meeting.locationLabel,
    locationName: meeting.locationName,
    address: meeting.address,
    calendarLink: meeting.calendar?.calendarLink || null,
    joinUrl: meeting.zoom?.joinUrl || null,
    lifecycleStatus: meeting.lifecycleStatus,
    needsAttention: attentionItems.length > 0,
    attentionItems,
    status: meeting.lifecycleStatus === MEETING_LIFECYCLE.MEETING_READY ? "ready" : "preparing"
  };
}

async function getMeetingDashboardData(organizationId = null) {
  const meetings = await meetingStore.listMeetings();
  const scoped = organizationId
    ? meetings.filter((entry) => entry.organizationId === organizationId)
    : meetings;

  const now = new Date();
  const upcoming = scoped
    .filter((entry) => new Date(entry.startTime) >= now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const todaysMeetings = scoped
    .filter((entry) => isSameDay(entry.startTime, now))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const needsAttention = scoped
    .filter((entry) => resolveAttentionItems(entry).length > 0)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map(serializeDashboardMeeting);

  const meetingActivity = (await meetingStore.listActivity(8)).map((entry) => ({
    id: entry.id,
    type: entry.type,
    message: entry.message,
    createdAt: entry.createdAt
  }));

  return {
    todaysMeetings: todaysMeetings.map(serializeDashboardMeeting),
    nextMeeting: upcoming[0] ? serializeDashboardMeeting(upcoming[0]) : null,
    upcomingMeetings: upcoming.slice(0, 5).map(serializeDashboardMeeting),
    needsAttention,
    meetingActivity
  };
}

module.exports = {
  getMeetingDashboardData,
  serializeDashboardMeeting
};
