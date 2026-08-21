/**
 * DR1 — Appointment reminder row ↔ engine entry mapping.
 */

function rowToReminder(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    organizationId: row.organization_id,
    prospectPhone: row.prospect_phone || null,
    reminderType: row.reminder_type,
    scheduledFor: row.scheduled_for,
    offsetMinutes: row.offset_minutes ?? null,
    status: row.status,
    channel: row.channel || "whatsapp",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    appointmentStart: row.appointment_start || null,
    timezone: row.timezone || null,
    virtualMeetingUrl: row.virtual_meeting_url || null,
    meetingType: row.meeting_type || null,
    meetingLocationType: row.meeting_location_type || null,
    meetingProvider: row.meeting_provider || null,
    meetingAddress: row.meeting_address || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    deliveryStatus: row.delivery_status || null,
    failureReason: row.failure_reason || null,
    retryable: row.retryable ?? null,
    sentAt: row.sent_at || null,
    lastAttemptAt: row.last_attempt_at || null,
    cancelledAt: row.cancelled_at || null,
    cancelReason: row.cancel_reason || null,
    migratedFrom: row.migrated_from || null
  };
}

function reminderToRow(entry) {
  return {
    id: entry.id,
    organization_id: entry.organizationId,
    appointment_id: entry.appointmentId,
    reminder_type: entry.reminderType,
    scheduled_for: entry.scheduledFor,
    offset_minutes: entry.offsetMinutes ?? null,
    status: entry.status,
    channel: entry.channel || "whatsapp",
    prospect_phone: entry.prospectPhone || null,
    appointment_start: entry.appointmentStart || null,
    timezone: entry.timezone || null,
    virtual_meeting_url: entry.virtualMeetingUrl || null,
    meeting_type: entry.meetingType || null,
    meeting_location_type: entry.meetingLocationType || null,
    meeting_provider: entry.meetingProvider || null,
    meeting_address: entry.meetingAddress || null,
    metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
    delivery_status: entry.deliveryStatus || null,
    failure_reason: entry.failureReason || null,
    retryable: typeof entry.retryable === "boolean" ? entry.retryable : null,
    sent_at: entry.sentAt || null,
    last_attempt_at: entry.lastAttemptAt || null,
    cancelled_at: entry.cancelledAt || null,
    cancel_reason: entry.cancelReason || null,
    migrated_from: entry.migratedFrom || null,
    created_at: entry.createdAt || new Date().toISOString(),
    updated_at: entry.updatedAt || new Date().toISOString()
  };
}

module.exports = {
  rowToReminder,
  reminderToRow
};
