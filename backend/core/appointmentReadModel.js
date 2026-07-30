/**
 * Sprint 12.2 Phase 1.1 — Appointment persistence ↔ domain read/write mapping.
 * Column `owner_rep_id` is canonical; metadata.ownerRepId is kept for backward compatibility.
 */

function resolveOwnerRepIdFromRow(row) {
  if (!row) {
    return null;
  }

  return (
    row.owner_rep_id ||
    row.ownerRepId ||
    row.metadata?.ownerRepId ||
    row.metadata?.owner_rep_id ||
    null
  );
}

function resolveOwnerRepIdFromAppointment(appointment) {
  if (!appointment) {
    return null;
  }

  return (
    appointment.ownerRepId ||
    appointment.metadata?.ownerRepId ||
    appointment.metadata?.owner_rep_id ||
    null
  );
}

function rowToAppointment(row) {
  if (!row) {
    return null;
  }

  const ownerRepId = resolveOwnerRepIdFromRow(row);

  return {
    id: row.id,
    organizationId: row.organization_id || row.organizationId,
    prospectId: row.prospect_id || row.prospectId || null,
    prospectPhone: row.prospect_phone || row.prospectPhone,
    agentId: row.agent_id || row.agentId,
    purpose: row.purpose,
    status: row.status,
    source: row.source,
    startDateTime: row.start_date_time || row.startDateTime,
    endDateTime: row.end_date_time || row.endDateTime,
    durationMinutes: row.duration_minutes ?? row.durationMinutes,
    timezone: row.timezone,
    meetingType: row.meeting_type || row.meetingType,
    meetingProvider: row.meeting_provider || row.meetingProvider || null,
    meetingLocationType: row.meeting_location_type || row.meetingLocationType || null,
    meetingLocationName: row.meeting_location_name || row.meetingLocationName || null,
    meetingAddress: row.meeting_address || row.meetingAddress || null,
    meetingNotes: row.meeting_notes || row.meetingNotes || null,
    virtualMeetingUrl: row.virtual_meeting_url || row.virtualMeetingUrl || null,
    calendarEventId: row.calendar_event_id || row.calendarEventId || null,
    calendarProvider: row.calendar_provider || row.calendarProvider || null,
    confirmationStatus: row.confirmation_status || row.confirmationStatus,
    emailInvitationStatus: row.email_invitation_status || row.emailInvitationStatus,
    reminderStatus: row.reminder_status || row.reminderStatus,
    humanAssistRequired: Boolean(row.human_assist_required ?? row.humanAssistRequired),
    humanAssistReason: row.human_assist_reason || row.humanAssistReason || null,
    rescheduleCount: row.reschedule_count ?? row.rescheduleCount ?? 0,
    cancellationReason: row.cancellation_reason || row.cancellationReason || null,
    outcome: row.outcome || null,
    outcomeNotes: row.outcome_notes || row.outcomeNotes || null,
    ownerRepId,
    history: row.history || [],
    metadata: row.metadata || {},
    createdBy: row.created_by || row.createdBy || null,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function appointmentToRow(appointment) {
  const ownerRepId = resolveOwnerRepIdFromAppointment(appointment);

  return {
    id: appointment.id,
    organization_id: appointment.organizationId,
    prospect_id: appointment.prospectId || null,
    prospect_phone: appointment.prospectPhone,
    agent_id: appointment.agentId,
    purpose: appointment.purpose,
    status: appointment.status,
    source: appointment.source,
    start_date_time: appointment.startDateTime,
    end_date_time: appointment.endDateTime,
    duration_minutes: appointment.durationMinutes,
    timezone: appointment.timezone,
    meeting_type: appointment.meetingType,
    meeting_provider: appointment.meetingProvider || null,
    meeting_location_type: appointment.meetingLocationType || null,
    meeting_location_name: appointment.meetingLocationName || null,
    meeting_address: appointment.meetingAddress || null,
    meeting_notes: appointment.meetingNotes || null,
    virtual_meeting_url: appointment.virtualMeetingUrl || null,
    calendar_event_id: appointment.calendarEventId || null,
    calendar_provider: appointment.calendarProvider || null,
    confirmation_status: appointment.confirmationStatus,
    email_invitation_status: appointment.emailInvitationStatus,
    reminder_status: appointment.reminderStatus,
    human_assist_required: appointment.humanAssistRequired,
    human_assist_reason: appointment.humanAssistReason || null,
    reschedule_count: appointment.rescheduleCount || 0,
    cancellation_reason: appointment.cancellationReason || null,
    outcome: appointment.outcome || null,
    outcome_notes: appointment.outcomeNotes || null,
    owner_rep_id: ownerRepId,
    history: appointment.history || [],
    metadata: {
      ...(appointment.metadata || {}),
      ownerRepId,
      lifecycleState: appointment.metadata?.lifecycleState || null
    },
    created_by: appointment.createdBy || null,
    created_at: appointment.createdAt,
    updated_at: appointment.updatedAt
  };
}

module.exports = {
  resolveOwnerRepIdFromRow,
  resolveOwnerRepIdFromAppointment,
  rowToAppointment,
  appointmentToRow
};
