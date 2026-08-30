/**
 * BR-176 — current user notification feed and preferences.
 */

const express = require("express");
const agentNotificationService = require("../services/agentNotificationService");

const router = express.Router();

function actorContext(req) {
  return {
    organizationId: req.tenantContext?.organizationId || null,
    userId: req.authContext?.userId || req.sanitizedUser?.id || null,
    controlPlaneOnly: req.controlPlaneOnly === true
  };
}

function denyIfIsolated(req, res) {
  const { organizationId, userId, controlPlaneOnly } = actorContext(req);
  if (controlPlaneOnly || !organizationId || !userId) {
    return { blocked: true, organizationId, userId };
  }
  return { blocked: false, organizationId, userId };
}

router.get("/notifications", async (req, res) => {
  const scope = denyIfIsolated(req, res);
  if (scope.blocked) {
    return res.json({ notifications: [], unreadCount: 0, controlPlane: true });
  }
  try {
    const [notifications, unread] = await Promise.all([
      agentNotificationService.listMyNotifications({
        organizationId: scope.organizationId,
        userId: scope.userId
      }),
      agentNotificationService.unreadCount({
        organizationId: scope.organizationId,
        userId: scope.userId
      })
    ]);
    return res.json({ notifications, unreadCount: unread });
  } catch (error) {
    console.error("[agent-notifications/list]", error.message);
    return res.status(500).json({ error: "NOTIFICATIONS_UNAVAILABLE" });
  }
});

router.get("/notifications/unread-count", async (req, res) => {
  const scope = denyIfIsolated(req, res);
  if (scope.blocked) {
    return res.json({ unreadCount: 0, controlPlane: true });
  }
  try {
    const unread = await agentNotificationService.unreadCount({
      organizationId: scope.organizationId,
      userId: scope.userId
    });
    return res.json({ unreadCount: unread });
  } catch (error) {
    return res.status(500).json({ error: "NOTIFICATIONS_UNAVAILABLE" });
  }
});

router.get("/notifications/preferences", async (req, res) => {
  const userId = req.authContext?.userId || req.sanitizedUser?.id || null;
  if (!userId) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  try {
    const preferences = await agentNotificationService.getPreferences({ userId });
    return res.json({ preferences });
  } catch (error) {
    return res.status(500).json({ error: "NOTIFICATION_PREFERENCES_UNAVAILABLE" });
  }
});

router.patch("/notifications/preferences", async (req, res) => {
  const { organizationId, userId } = actorContext(req);
  if (!userId) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  try {
    const preferences = await agentNotificationService.updatePreferences({
      userId,
      organizationId,
      patch: req.body || {}
    });
    return res.json({ preferences });
  } catch (error) {
    return res.status(500).json({ error: "NOTIFICATION_PREFERENCES_UPDATE_FAILED" });
  }
});

router.post("/notifications/read-all", async (req, res) => {
  const scope = denyIfIsolated(req, res);
  if (scope.blocked) {
    return res.json({ updated: 0, controlPlane: true });
  }
  try {
    const updated = await agentNotificationService.markAllRead({
      organizationId: scope.organizationId,
      userId: scope.userId
    });
    return res.json({ updated });
  } catch (error) {
    return res.status(500).json({ error: "NOTIFICATIONS_UPDATE_FAILED" });
  }
});

router.post("/notifications/:id/read", async (req, res) => {
  const scope = denyIfIsolated(req, res);
  if (scope.blocked) {
    return res.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
  }
  try {
    const notification = await agentNotificationService.markRead({
      id: req.params.id,
      organizationId: scope.organizationId,
      userId: scope.userId
    });
    if (!notification) {
      return res.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
    }
    return res.json({ notification });
  } catch (error) {
    return res.status(500).json({ error: "NOTIFICATIONS_UPDATE_FAILED" });
  }
});

module.exports = router;
