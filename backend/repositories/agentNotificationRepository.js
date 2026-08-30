/**
 * BR-176 — service-role access to agent_notifications.
 */

const { supabase } = require("../services/supabaseService");

function isTableMissing(error) {
  const message = String(error?.message || error?.details || error || "");
  const code = String(error?.code || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  );
}

function mapRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    recipientUserId: row.recipient_user_id,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actionUrl: row.action_url,
    severity: row.severity,
    createdAt: row.created_at,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
    dedupKey: row.dedup_key
  };
}

function createSupabaseNotificationStore() {
  return {
    async insertNotification(row) {
      const { data, error } = await supabase
        .from("agent_notifications")
        .insert({
          id: row.id,
          organization_id: row.organizationId,
          recipient_user_id: row.recipientUserId,
          event_type: row.eventType,
          title: row.title,
          body: row.body,
          entity_type: row.entityType,
          entity_id: row.entityId,
          action_url: row.actionUrl,
          severity: row.severity,
          created_at: row.createdAt,
          read_at: row.readAt,
          dismissed_at: row.dismissedAt,
          dedup_key: row.dedupKey
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          error.duplicate = true;
        }
        if (isTableMissing(error)) {
          const missing = new Error("AGENT_NOTIFICATIONS_UNAVAILABLE");
          missing.code = "PGRST205";
          throw missing;
        }
        throw error;
      }
      return mapRow(data);
    },
    async listForRecipient({ organizationId, recipientUserId, limit = 50 }) {
      const { data, error } = await supabase
        .from("agent_notifications")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("recipient_user_id", recipientUserId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isTableMissing(error)) {
          return [];
        }
        throw error;
      }
      return (data || []).map(mapRow);
    },
    async countUnread({ organizationId, recipientUserId }) {
      const { count, error } = await supabase
        .from("agent_notifications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("recipient_user_id", recipientUserId)
        .is("read_at", null)
        .is("dismissed_at", null);
      if (error) {
        if (isTableMissing(error)) {
          return 0;
        }
        throw error;
      }
      return Number(count || 0);
    },
    async getById({ id, organizationId, recipientUserId }) {
      const { data, error } = await supabase
        .from("agent_notifications")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("recipient_user_id", recipientUserId)
        .maybeSingle();
      if (error) {
        if (isTableMissing(error)) {
          return null;
        }
        throw error;
      }
      return mapRow(data);
    },
    async markRead({ id, organizationId, recipientUserId, readAt }) {
      const existing = await this.getById({ id, organizationId, recipientUserId });
      if (!existing) {
        return null;
      }
      if (existing.readAt) {
        return existing;
      }
      const { data, error } = await supabase
        .from("agent_notifications")
        .update({ read_at: readAt })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("recipient_user_id", recipientUserId)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      return mapRow(data);
    },
    async markAllRead({ organizationId, recipientUserId, readAt }) {
      const { data, error } = await supabase
        .from("agent_notifications")
        .update({ read_at: readAt })
        .eq("organization_id", organizationId)
        .eq("recipient_user_id", recipientUserId)
        .is("read_at", null)
        .is("dismissed_at", null)
        .select("id");
      if (error) {
        if (isTableMissing(error)) {
          return 0;
        }
        throw error;
      }
      return (data || []).length;
    },
    async getUserNotificationPreferences(userId) {
      const { data, error } = await supabase
        .from("atlas_users")
        .select("notification_preferences")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) {
        return {};
      }
      return data.notification_preferences || {};
    },
    async saveUserNotificationPreferences(userId, nextPreferences) {
      const { data, error } = await supabase
        .from("atlas_users")
        .update({
          notification_preferences: nextPreferences,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("notification_preferences")
        .single();
      if (error) {
        throw error;
      }
      return data.notification_preferences || nextPreferences;
    }
  };
}

module.exports = {
  mapRow,
  createSupabaseNotificationStore
};
