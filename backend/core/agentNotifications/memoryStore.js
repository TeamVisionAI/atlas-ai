/**
 * BR-176 — in-memory notification store for tests. No network.
 */

function createMemoryNotificationStore() {
  const notifications = new Map();
  const preferencesByUser = new Map();

  return {
    notifications,
    preferencesByUser,
    async insertNotification(row) {
      const key = `${row.organizationId}:${row.recipientUserId}:${row.dedupKey}`;
      for (const existing of notifications.values()) {
        if (
          existing.organizationId === row.organizationId &&
          existing.recipientUserId === row.recipientUserId &&
          existing.dedupKey === row.dedupKey
        ) {
          const error = new Error("DUPLICATE_NOTIFICATION");
          error.code = "23505";
          error.duplicate = true;
          throw error;
        }
      }
      notifications.set(row.id, { ...row });
      return notifications.get(row.id);
    },
    async listForRecipient({ organizationId, recipientUserId, limit = 50 }) {
      return [...notifications.values()]
        .filter(
          (row) =>
            row.organizationId === organizationId &&
            row.recipientUserId === recipientUserId &&
            !row.dismissedAt
        )
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);
    },
    async countUnread({ organizationId, recipientUserId }) {
      return [...notifications.values()].filter(
        (row) =>
          row.organizationId === organizationId &&
          row.recipientUserId === recipientUserId &&
          !row.readAt &&
          !row.dismissedAt
      ).length;
    },
    async getById({ id, organizationId, recipientUserId }) {
      const row = notifications.get(id);
      if (
        !row ||
        row.organizationId !== organizationId ||
        row.recipientUserId !== recipientUserId
      ) {
        return null;
      }
      return row;
    },
    async markRead({ id, organizationId, recipientUserId, readAt }) {
      const row = await this.getById({ id, organizationId, recipientUserId });
      if (!row) {
        return null;
      }
      row.readAt = row.readAt || readAt;
      return row;
    },
    async markAllRead({ organizationId, recipientUserId, readAt }) {
      let count = 0;
      for (const row of notifications.values()) {
        if (
          row.organizationId === organizationId &&
          row.recipientUserId === recipientUserId &&
          !row.readAt &&
          !row.dismissedAt
        ) {
          row.readAt = readAt;
          count += 1;
        }
      }
      return count;
    },
    async getUserNotificationPreferences(userId) {
      return preferencesByUser.get(userId) || {};
    },
    async saveUserNotificationPreferences(userId, nextPreferences) {
      preferencesByUser.set(userId, nextPreferences);
      return nextPreferences;
    }
  };
}

module.exports = {
  createMemoryNotificationStore
};
