const crypto = require("crypto");
const { supabase } = require("../services/supabaseService");

function rowToFollowUp(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    subjectLabel: row.subject_label || null,
    subjectPhone: row.subject_phone || null,
    sourceEvent: row.source_event,
    title: row.title,
    notes: row.notes || null,
    dueDate: row.due_date,
    dueTime: row.due_time || null,
    dueAt: row.due_at || null,
    status: row.status,
    priority: row.priority,
    completedAt: row.completed_at || null,
    completedBy: row.completed_by || null,
    completionNote: row.completion_note || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dedupKey: row.dedup_key,
    history: Array.isArray(row.history) ? row.history : [],
    appointmentId: row.appointment_id || null
  };
}

function followUpToRow(followUp) {
  return {
    id: followUp.id || crypto.randomUUID(),
    organization_id: followUp.organizationId,
    owner_user_id: followUp.ownerUserId,
    entity_type: followUp.entityType,
    entity_id: String(followUp.entityId),
    subject_label: followUp.subjectLabel || null,
    subject_phone: followUp.subjectPhone || null,
    source_event: followUp.sourceEvent,
    appointment_id: followUp.appointmentId || null,
    title: followUp.title,
    notes: followUp.notes || null,
    due_date: followUp.dueDate,
    due_time: followUp.dueTime || null,
    due_at: followUp.dueAt || null,
    status: followUp.status,
    priority: followUp.priority || "NORMAL",
    completed_at: followUp.completedAt || null,
    completed_by: followUp.completedBy || null,
    completion_note: followUp.completionNote || null,
    created_by: followUp.createdBy || null,
    created_at: followUp.createdAt || new Date().toISOString(),
    updated_at: followUp.updatedAt || new Date().toISOString(),
    dedup_key: followUp.dedupKey,
    history: followUp.history || []
  };
}

async function upsert(followUp) {
  const row = followUpToRow(followUp);
  const { data, error } = await supabase.from("atlas_follow_ups").upsert(row).select("*").single();
  if (error) {
    throw error;
  }
  return rowToFollowUp(data);
}

async function findById(id, organizationId) {
  let query = supabase.from("atlas_follow_ups").select("*").eq("id", id);
  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }
  return rowToFollowUp(data);
}

async function findByDedupKey(organizationId, dedupKey) {
  const { data, error } = await supabase
    .from("atlas_follow_ups")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("dedup_key", dedupKey)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return rowToFollowUp(data);
}

async function listOpenByAppointment(organizationId, appointmentId) {
  if (!appointmentId) {
    return [];
  }
  const { data, error } = await supabase
    .from("atlas_follow_ups")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "OPEN")
    .eq("appointment_id", appointmentId)
    .like("source_event", "outcome:%");
  if (error) {
    throw error;
  }
  return (data || []).map(rowToFollowUp);
}

async function listOpenForProspect(organizationId, { prospectId = null, subjectPhone = null } = {}) {
  const { isProspectLinkedFollowUp } = require("../core/followUps/prospectClosePolicy");
  const keys = [...new Set([prospectId, subjectPhone].filter(Boolean).map(String))];
  if (!organizationId || !keys.length) {
    return [];
  }

  const byEntity = await supabase
    .from("atlas_follow_ups")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "OPEN")
    .in("entity_id", keys);

  if (byEntity.error) {
    throw byEntity.error;
  }

  let byPhone = { data: [] };
  if (subjectPhone) {
    byPhone = await supabase
      .from("atlas_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "OPEN")
      .eq("subject_phone", subjectPhone);
    if (byPhone.error) {
      throw byPhone.error;
    }
  }

  const merged = new Map();
  for (const row of [...(byEntity.data || []), ...(byPhone.data || [])]) {
    const followUp = rowToFollowUp(row);
    if (followUp && isProspectLinkedFollowUp(followUp, { prospectId, subjectPhone })) {
      merged.set(followUp.id, followUp);
    }
  }
  return [...merged.values()];
}

async function listForOwners({ organizationId, ownerUserIds, statuses }) {
  let query = supabase.from("atlas_follow_ups").select("*").eq("organization_id", organizationId);
  if (ownerUserIds?.length === 1) {
    query = query.eq("owner_user_id", ownerUserIds[0]);
  } else if (ownerUserIds?.length > 1) {
    query = query.in("owner_user_id", ownerUserIds);
  }
  if (statuses?.length) {
    query = query.in("status", statuses);
  }
  const { data, error } = await query.order("due_date", { ascending: true });
  if (error) {
    throw error;
  }
  return (data || []).map(rowToFollowUp);
}

module.exports = {
  rowToFollowUp,
  followUpToRow,
  upsert,
  findById,
  findByDedupKey,
  listOpenByAppointment,
  listOpenForProspect,
  listForOwners
};
