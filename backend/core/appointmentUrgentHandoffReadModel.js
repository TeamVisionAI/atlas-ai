function rowToHandoff(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    appointmentId: row.appointment_id,
    assignedUserId: row.assigned_user_id,
    prospectPhone: row.prospect_phone,
    prospectName: row.prospect_name || null,
    appointmentStart: row.appointment_start,
    purpose: row.purpose || null,
    meetingType: row.meeting_type || null,
    minutesUntilStart: row.minutes_until_start ?? null,
    status: row.status,
    prospectConfirmationSentAt: row.prospect_confirmation_sent_at || null,
    prospectConfirmationStatus: row.prospect_confirmation_status || null,
    agentWhatsappStatus: row.agent_whatsapp_status || null,
    agentWhatsappSentAt: row.agent_whatsapp_sent_at || null,
    acknowledgedAt: row.acknowledged_at || null,
    acknowledgedByUserId: row.acknowledged_by_user_id || null,
    escalatedAt: row.escalated_at || null,
    escalatedToUserId: row.escalated_to_user_id || null,
    escalationDueAt: row.escalation_due_at || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function handoffToRow(handoff) {
  return {
    id: handoff.id,
    organization_id: handoff.organizationId,
    appointment_id: handoff.appointmentId,
    assigned_user_id: handoff.assignedUserId,
    prospect_phone: handoff.prospectPhone,
    prospect_name: handoff.prospectName || null,
    appointment_start: handoff.appointmentStart,
    purpose: handoff.purpose || null,
    meeting_type: handoff.meetingType || null,
    minutes_until_start: handoff.minutesUntilStart ?? null,
    status: handoff.status,
    prospect_confirmation_sent_at: handoff.prospectConfirmationSentAt || null,
    prospect_confirmation_status: handoff.prospectConfirmationStatus || null,
    agent_whatsapp_status: handoff.agentWhatsappStatus || null,
    agent_whatsapp_sent_at: handoff.agentWhatsappSentAt || null,
    acknowledged_at: handoff.acknowledgedAt || null,
    acknowledged_by_user_id: handoff.acknowledgedByUserId || null,
    escalated_at: handoff.escalatedAt || null,
    escalated_to_user_id: handoff.escalatedToUserId || null,
    escalation_due_at: handoff.escalationDueAt || null,
    metadata: handoff.metadata || {},
    created_at: handoff.createdAt || new Date().toISOString(),
    updated_at: handoff.updatedAt || new Date().toISOString()
  };
}

module.exports = {
  rowToHandoff,
  handoffToRow
};
