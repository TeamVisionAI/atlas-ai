/**
 * Release 1.4 — Mission Control event constants.
 */

const MissionEvent = Object.freeze({
  UPDATED: "mission.updated",
  SNAPSHOT_CREATED: "mission.snapshot.created",
  ALERT_CREATED: "mission.alert.created",
  ALERT_RESOLVED: "mission.alert.resolved",
  TIMELINE_UPDATED: "mission.timeline.updated",
  HEALTH_CHANGED: "mission.health.changed",
  METRICS_UPDATED: "mission.metrics.updated"
});

module.exports = {
  MissionEvent
};
